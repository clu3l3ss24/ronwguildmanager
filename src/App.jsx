import { useEffect, useRef, useState } from 'react';
import { collection, deleteDoc, doc, getDocs, onSnapshot, runTransaction, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import Navbar from './components/Navbar'; import Dashboard from './pages/Dashboard'; import RosterDashboard from './pages/RosterDashboard'; import Teams from './pages/Teams'; import Attendance from './pages/Attendance';
import { auth, db, firebaseEnabled } from './firebase/config';
import Settings from './pages/Settings';
import AccountGate from './components/AccountGate';
import { formationMemberNames, prepareFormation } from './firebase/teams';
import { autoBalanceBoard, blankBoard, blankStaticBoard, boardError, BOARD_MODES, changeBoardMode, formationSaveError, normalizeBoard, normalizeStaticBoard, serializeBoard } from './firebase/board';
import { prepareRosterImport, reconcileSavedFormation, replaceGuildRoster } from './firebase/importRoster';
import { attendanceRecordId } from './utils/attendance';

const seedMembers = [];
const stored = key => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
const boardMetaId = '_meta';
const teamRecord = (value, id) => { const groups = serializeBoard(value).groups; const index = groups.findIndex(group => group.id === id); return index < 0 ? null : { ...groups[index], order: index }; };
const boardFromTeamDocs = (snap, fallbackMode) => { const meta = snap.docs.find(item => item.id === boardMetaId)?.data() || {}; return normalizeBoard({ mode: meta.mode || fallbackMode, sub: meta.sub, teams: { groups: snap.docs.filter(item => item.id !== boardMetaId).sort((a, b) => (a.data().order ?? Number.MAX_SAFE_INTEGER) - (b.data().order ?? Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id)).map(item => ({ id: item.id, name: item.data().name || '', parties: item.data().parties || [] })) } }); };
export default function App() {
  return <AccountGate>{session => <GuildWorkspace key={`${session.user?.uid || 'local-demo'}:${session.guild?.id || ''}`} {...session} />}</AccountGate>;
}
function GuildWorkspace({ user, guild, exitDemo, role = 'Account owner' }) {
  const [workspace, setWorkspace] = useState(guild);
  const [theme, setTheme] = useState(() => localStorage.getItem('ronw-theme') || 'dark');
  useEffect(() => {
    localStorage.setItem('ronw-theme', theme);
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const apply = () => { document.documentElement.dataset.theme = theme === 'system' ? (media.matches ? 'light' : 'dark') : theme; };
    apply(); media.addEventListener('change', apply); return () => media.removeEventListener('change', apply);
  }, [theme]);
  const tokenPermission = guild?.tokenPermission;
  const memberTokenSession = Boolean(user?.isAnonymous);
  guild = workspace;
  role = user?.isAnonymous ? ((tokenPermission || (guild?.sharedReadOnly ? 'view' : 'edit')) === 'view' ? 'Viewer' : 'Collaborator') : 'Account owner';
  const [startPage, setStartPage] = useState(() => { const saved = localStorage.getItem('ronw-start-page'); return ['dashboard', 'members', 'teams', 'static', 'attendance'].includes(saved) ? saved : 'dashboard'; });
  useEffect(() => { localStorage.setItem('ronw-start-page', startPage); }, [startPage]);
  const [page, setPage] = useState(startPage);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(!firebaseEnabled);
  const [members, setMembers] = useState(() => firebaseEnabled ? [] : stored('row-members') || seedMembers);
  const [board, setBoard] = useState(() => normalizeBoard(firebaseEnabled ? blankBoard() : stored('row-teams') || blankBoard()));
  const teams = board.teams;
  const [staticBoard, setStaticBoard] = useState(() => normalizeStaticBoard(firebaseEnabled ? blankStaticBoard() : stored('row-static-teams') || blankStaticBoard()));
  const [staticDraft, setStaticDraft] = useState(() => normalizeStaticBoard(firebaseEnabled ? blankStaticBoard() : stored('row-static-teams') || blankStaticBoard()));
  const [attendanceRows, setAttendanceRows] = useState(() => firebaseEnabled ? [] : stored('row-attendance') || []);
  const [savedTeams, setSavedTeams] = useState(() => firebaseEnabled ? [] : (stored('row-saved-teams') || []).map(item => ({ ...item, ...normalizeBoard(item) })));
  const [busy, setBusy] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [presenceDocs, setPresenceDocs] = useState([]);
  const [presenceClock, setPresenceClock] = useState(Date.now());
  const setNotice = message => { if (message) setNotifications(current => [{ id: crypto.randomUUID(), message, createdAt: new Date().toISOString() }, ...current].slice(0, 50)); };
  const [activeSaveId, setActiveSaveId] = useState(null);
  const [loadedSaveId, setLoadedSaveId] = useState(null);
  const boardRef = useRef(board);
  const confirmedBoardRef = useRef(board);
  const collabBoardReadyRef = useRef(false);
  const staticBoardRef = useRef(staticBoard);
  const staticBoardVersionRef = useRef(null);
  const localStaticEditRef = useRef(null);
  const operationRef = useRef(false);
  const teamSaveQueueRef = useRef(Promise.resolve());
  const teamSaveActiveRef = useRef(false);
  const pendingTeamSavesRef = useRef(0);
  const queuedTeamSaveFailedRef = useRef(false);
  const guildId = guild?.id;
  useEffect(() => {
    if (!firebaseEnabled) return;
    let active = true;
    const ready = new Set();
    const mark = key => { ready.add(key); if (active && ready.size === 4) setLoaded(true); };
    const failed = () => { if (active) setError('Could not load your workspace. Check your connection and Firestore rules, then reload.'); };
    const failedStatic = () => { if (active) { setError('Could not load the Static planner. Deploy the latest Firestore rules, then reload.'); mark('static'); } };
    const unsubscribers = [
      onSnapshot(collection(db, 'guilds', guildId, 'members'), snap => { if (active) { setMembers(snap.docs.map(item => ({ ...item.data(), id: item.id }))); mark('members'); } }, failed),
      onSnapshot(doc(db, 'guilds', guildId), snap => { if (active && snap.exists()) {
        setWorkspace(current => ({ ...current, ...snap.data() }));
        if (!collabBoardReadyRef.current) {
          const next = normalizeBoard(snap.data().teams);
          boardRef.current = next; confirmedBoardRef.current = next; setBoard(next);
        }
        mark('teams');
      } }, failed),
      onSnapshot(collection(db, 'guilds', guildId, 'savedTeams'), snap => { if (active) { setSavedTeams(snap.docs.map(item => ({ ...item.data(), id: item.id, ...normalizeBoard(item.data().teams) })).sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt)))); mark('saved'); } }, failed),
      onSnapshot(collection(db, 'guilds', guildId, 'teamBoards'), snap => { if (!active) return;
        const meta = snap.docs.find(item => item.id === boardMetaId);
        if (!meta) {
          if (role !== 'Viewer') runTransaction(db, async transaction => {
            const metaRef = doc(db, 'guilds', guildId, 'teamBoards', boardMetaId);
            const savedMeta = await transaction.get(metaRef);
            if (savedMeta.exists()) return;
            const guildRef = doc(db, 'guilds', guildId);
            const savedGuild = await transaction.get(guildRef);
            const legacy = normalizeBoard(savedGuild.data()?.teams || blankBoard());
            for (const [order, group] of serializeBoard(legacy).groups.entries()) transaction.set(doc(db, 'guilds', guildId, 'teamBoards', group.id), { name: group.name, parties: group.parties, order, updatedAt: serverTimestamp() });
            transaction.set(metaRef, { mode: legacy.mode, schemaVersion: 1, updatedAt: serverTimestamp() });
          }).catch(failed);
          return;
        }
        collabBoardReadyRef.current = true;
        const next = boardFromTeamDocs(snap, 'guild-league');
        confirmedBoardRef.current = next;
        if (!teamSaveActiveRef.current) { boardRef.current = next; setBoard(next); }
        mark('teams');
      }, failed),
      onSnapshot(doc(db, 'guilds', guildId, 'staticBoard', 'board'), snap => { if (active) {
        const next = normalizeStaticBoard(snap.exists() ? snap.data().teams : blankStaticBoard());
        const version = snap.exists() ? snap.data().boardEditId || null : null;
        const changed = JSON.stringify(next) !== JSON.stringify(staticBoardRef.current) || version !== staticBoardVersionRef.current;
        if (ready.has('static') && changed && version !== localStaticEditRef.current) setNotice('The shared static board was updated in another session.');
        staticBoardRef.current = next; staticBoardVersionRef.current = version; setStaticBoard(next); setStaticDraft(next); mark('static');
      } }, failedStatic),
      onSnapshot(collection(db, 'guilds', guildId, 'attendanceRecords'), snap => { if (active) setAttendanceRows(snap.docs.map(item => ({ ...item.data(), id: item.id })).sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name))); }, () => { if (active) setError('Could not load attendance. Deploy the latest Firestore rules, then reload.'); }),
    ];
    return () => { active = false; unsubscribers.forEach(unsubscribe => unsubscribe()); };
  }, [guildId, role]);
  useEffect(() => { if (!firebaseEnabled) localStorage.setItem('row-members', JSON.stringify(members)); }, [members]);
  useEffect(() => { if (!firebaseEnabled) localStorage.setItem('row-saved-teams', JSON.stringify(savedTeams)); }, [savedTeams]);
  useEffect(() => { if (!firebaseEnabled) localStorage.setItem('row-teams', JSON.stringify(board)); }, [board]);
  useEffect(() => { if (!firebaseEnabled) localStorage.setItem('row-static-teams', JSON.stringify(staticBoard)); }, [staticBoard]);
  useEffect(() => { if (!firebaseEnabled) localStorage.setItem('row-attendance', JSON.stringify(attendanceRows)); }, [attendanceRows]);
  useEffect(() => {
    if (!firebaseEnabled || !guildId) return;
    return onSnapshot(collection(db, 'guilds', guildId, 'teamBuilderPresence'), snap => setPresenceDocs(snap.docs.map(item => ({ id: item.id, ...item.data() }))), () => {});
  }, [guildId]);
  useEffect(() => {
    if (!firebaseEnabled || !guildId || page !== 'teams' || !user?.uid) return;
    const presenceRef = doc(db, 'guilds', guildId, 'teamBuilderPresence', user.uid);
    const displayName = user.displayName || guild?.tokenName || (user.isAnonymous ? 'Shared member' : 'Guild owner');
    const pulse = () => setDoc(presenceRef, { displayName, updatedAt: serverTimestamp() }, { merge: true }).catch(() => {});
    pulse();
    const interval = setInterval(pulse, 20000);
    return () => { clearInterval(interval); deleteDoc(presenceRef).catch(() => {}); };
  }, [guildId, page, user?.uid, user?.displayName, guild?.tokenName]);
  useEffect(() => { const interval = setInterval(() => setPresenceClock(Date.now()), 10000); return () => clearInterval(interval); }, []);
  const activeTeamBuilderUsers = presenceDocs.filter(item => { const updatedAt = item.updatedAt?.toMillis?.(); return updatedAt && presenceClock - updatedAt < 45000; }).map(item => item.displayName);
  const appendAttendance = async rows => {
    if (role === 'Viewer' || operationRef.current) return false;
    const uniqueRows = [...new Map(rows.map(row => [attendanceRecordId(row), row])).entries()];
    operationRef.current = true; setBusy(true);
    try {
      if (firebaseEnabled) {
        for (let offset = 0; offset < uniqueRows.length; offset += 400) {
          const batch = writeBatch(db);
          uniqueRows.slice(offset, offset + 400).forEach(([id, row]) => batch.set(doc(db, 'guilds', guildId, 'attendanceRecords', id), { ...row, updatedAt: serverTimestamp() }, { merge: true }));
          await batch.commit();
        }
      } else {
        setAttendanceRows(current => {
          const records = new Map(current.map(row => [attendanceRecordId(row), row]));
          uniqueRows.forEach(([id, row]) => records.set(id, { ...records.get(id), ...row }));
          return [...records.values()].sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
        });
      }
      return true;
    } catch { reportFailure(); return false; }
    finally { operationRef.current = false; setBusy(false); }
  };
  const resetAttendance = async () => {
    if (role === 'Viewer' || operationRef.current) return false;
    operationRef.current = true; setBusy(true);
    try {
      if (firebaseEnabled) {
        const snapshot = await getDocs(collection(db, 'guilds', guildId, 'attendanceRecords'));
        for (let offset = 0; offset < snapshot.docs.length; offset += 400) {
          const batch = writeBatch(db);
          snapshot.docs.slice(offset, offset + 400).forEach(item => batch.delete(item.ref));
          await batch.commit();
        }
      } else setAttendanceRows([]);
      return true;
    } catch { reportFailure(); return false; }
    finally { operationRef.current = false; setBusy(false); }
  };
  const importMembers = async roster => {
    if (role === 'Viewer') throw Object.assign(new Error(), { code: 'permission-denied' });
    if (operationRef.current) throw Object.assign(new Error(), { code: 'import/busy' });
    operationRef.current = true; setBusy(true);
    try {
      let result;
      let removedSavedMembers = [];
      let removedActiveMembers = [];
      if (firebaseEnabled) result = await replaceGuildRoster(db, guildId, roster);
      else {
        const prepared = prepareRosterImport(roster, members);
        const reconciledSaves = savedTeams.map(snapshot => {
          const reconciled = reconcileSavedFormation(snapshot, prepared.members, members, snapshot.memberNames);
          removedSavedMembers.push(...reconciled.removedMembers.map(member => ({ ...member, formationName: snapshot.name || 'Saved formation' })));
          return { ...snapshot, ...reconciled.board, memberNames: reconciled.memberNames };
        });
        setSavedTeams(reconciledSaves);
        const reconciledActive = reconcileSavedFormation(boardRef.current, prepared.members, members);
        removedActiveMembers = reconciledActive.removedMembers.map(member => ({ ...member, formationName: 'Active Team Builder' }));
        setMembers(prepared.members); const cleared = blankBoard(board.mode); boardRef.current = cleared; confirmedBoardRef.current = cleared; setBoard(cleared);
        const currentStatic = normalizeStaticBoard(staticBoardRef.current);
        const previousStaticNames = formationMemberNames(currentStatic.teams, members);
        const reconciledStatic = prepareFormation(currentStatic.teams, prepared.members, currentStatic.groupNames, currentStatic.teamNames, previousStaticNames);
        const nextStatic = { ...currentStatic, teams: reconciledStatic.teams };
        result = { added: prepared.members.length, duplicates: prepared.duplicates, staticBoard: nextStatic, removedStaticMembers: reconciledStatic.removedMembers, removedSavedMembers, removedActiveMembers, offlineMembers: prepared.offlineMembers };
      }
      const nextStatic = normalizeStaticBoard(result.staticBoard || staticBoardRef.current);
      localStaticEditRef.current = result.staticBoardEditId || null;
      staticBoardRef.current = nextStatic; staticBoardVersionRef.current = result.staticBoardEditId || null; setStaticBoard(nextStatic); setStaticDraft(nextStatic);
      setError('');
      const removals = [
        ...(result.removedActiveMembers || []).map(member => ({ ...member, source: `${member.formationName} · ${member.side}` })),
        ...(result.removedSavedMembers || []).map(member => ({ ...member, source: `${member.formationName} · ${member.side}` })),
        ...(result.removedStaticMembers || []).map(member => ({ ...member, source: 'Static' })),
      ];
      const importNotices = [];
      if (removals.length) {
        const details = removals.map(member => `${member.name || 'Unknown member'} from ${member.source} / ${member.team} / ${member.party}`).join('; ');
        importNotices.push(`Roster import removed ${removals.length} saved party assignment${removals.length === 1 ? '' : 's'}: ${details}.`);
      }
      if (result.offlineMembers?.length) importNotices.push(`Members offline for 3 days or more (${result.offlineMembers.length}): ${result.offlineMembers.join(', ')}.`);
      if (importNotices.length) setNotice(importNotices.join(' '));
      return result;
    } finally { operationRef.current = false; setBusy(false); }
  };
  const reportFailure = () => setError('Your change could not be saved. Check your connection and try again.');
  const saveTeams = (next, { skipLoadedAutoSave = false } = {}) => {
    if (role === 'Viewer' || (operationRef.current && !teamSaveActiveRef.current)) return false;
    if (firebaseEnabled && !collabBoardReadyRef.current) { setError('Preparing the shared team board. Try again in a moment.'); return false; }
    const before = normalizeBoard(boardRef.current);
    const updated = normalizeBoard(typeof next === 'function' ? next(before) : next);
    const validationError = boardError(updated);
    if (validationError) { setError(validationError); return false; }
    const ids = new Set([...Object.keys(before.teams), ...Object.keys(updated.teams)]);
    const changedIds = [...ids].filter(id => JSON.stringify(teamRecord(before, id)) !== JSON.stringify(teamRecord(updated, id)));
    const modeChanged = before.mode !== updated.mode;
    const subChanged = JSON.stringify(before.sub) !== JSON.stringify(updated.sub);
    if (!changedIds.length && !modeChanged && !subChanged) return true;
    if (!pendingTeamSavesRef.current) {
      queuedTeamSaveFailedRef.current = false;
      teamSaveActiveRef.current = true;
      operationRef.current = true;
    }
    pendingTeamSavesRef.current += 1;
    boardRef.current = updated;
    setBoard(updated);
    setBusy(true);
    setNotice('');
    const persist = async () => {
      if (queuedTeamSaveFailedRef.current) return false;
      try {
        if (firebaseEnabled) await runTransaction(db, async transaction => {
        const metaRef = doc(db, 'guilds', guildId, 'teamBoards', boardMetaId);
        const loadedSaveRef = loadedSaveId && !skipLoadedAutoSave ? doc(db, 'guilds', guildId, 'savedTeams', loadedSaveId) : null;
        const meta = await transaction.get(metaRef);
        if (!meta.exists() || meta.data().mode !== before.mode) throw Object.assign(new Error('Board changed'), { code: 'formation/conflict' });
        const refs = [...ids].map(id => [id, doc(db, 'guilds', guildId, 'teamBoards', id)]);
        const [snapshots, loadedSave] = await Promise.all([
          Promise.all(refs.map(([, ref]) => transaction.get(ref))),
          loadedSaveRef ? transaction.get(loadedSaveRef) : Promise.resolve(null),
        ]);
        const currentRecords = new Map(refs.map(([id], index) => [id, snapshots[index].exists() ? { id, name: snapshots[index].data().name || '', parties: snapshots[index].data().parties || [], order: snapshots[index].data().order ?? 0 } : null]));
        for (const id of changedIds) if (JSON.stringify(currentRecords.get(id)) !== JSON.stringify(teamRecord(before, id))) throw Object.assign(new Error('Team changed'), { code: 'formation/conflict' });
        const candidate = normalizeBoard({ mode: before.mode, teams: { groups: [...currentRecords.values()].filter(Boolean).map(record => ({ id: record.id, name: record.name, parties: record.parties })) } });
        for (const id of changedIds) {
          const record = teamRecord(updated, id);
          if (!record) { delete candidate.teams[id]; delete candidate.teamNames[id]; delete candidate.groupNames[id]; }
          else { candidate.teams[id] = updated.teams[id]; candidate.teamNames[id] = updated.teamNames[id]; candidate.groupNames[id] = updated.groupNames[id]; }
        }
        candidate.mode = updated.mode;
        if (boardError(candidate)) throw Object.assign(new Error('Board changed'), { code: 'formation/conflict' });
        for (const id of changedIds) {
          const ref = doc(db, 'guilds', guildId, 'teamBoards', id);
          const record = teamRecord(updated, id);
          if (!record) transaction.delete(ref);
          else transaction.set(ref, { name: record.name, parties: record.parties, order: record.order, updatedAt: serverTimestamp() });
        }
        if (loadedSaveRef && loadedSave?.exists()) {
          const loaded = loadedSave.data();
          const autosaved = { ...updated, id: loadedSaveId, name: loaded.name || 'Loaded formation', createdAt: loaded.createdAt || new Date().toISOString(), memberNames: formationMemberNames(updated.teams, members) };
          transaction.update(loadedSaveRef, { teams: serializeBoard(autosaved), memberNames: autosaved.memberNames, updatedAt: new Date().toISOString() });
        }
        if (modeChanged || subChanged) transaction.update(metaRef, { ...(modeChanged ? { mode: updated.mode } : {}), ...(subChanged ? { sub: updated.sub ? { groups: Object.keys(updated.sub.teams).map(id => ({ id, name: updated.sub.groupNames[id], parties: updated.sub.teams[id].map((slots, index) => ({ slots, name: updated.sub.teamNames[id]?.[index] || '' })) })) } : null } : {}), updatedAt: serverTimestamp() });
        });
        else confirmedBoardRef.current = updated;
        if (loadedSaveId && !skipLoadedAutoSave) {
          setSavedTeams(current => current.map(item => item.id === loadedSaveId ? { ...item, ...updated, memberNames: formationMemberNames(updated.teams, members), updatedAt: new Date().toISOString() } : item));
        }
        setError('');
        return true;
      } catch (failure) {
        queuedTeamSaveFailedRef.current = true;
        if (failure.code === 'formation/conflict') setError('Someone changed this team or battle mode while you were editing. The latest board is syncing; try that change again.');
        else if (failure.code === 'permission-denied') setError('Firestore rejected this board update. Deploy the updated firestore.rules to allow Guild League SUB lineups, then try again.');
        else reportFailure();
        return false;
      }
    };
    const queued = teamSaveQueueRef.current.then(persist);
    teamSaveQueueRef.current = queued.catch(() => false);
    return queued.finally(() => {
      pendingTeamSavesRef.current -= 1;
      if (!pendingTeamSavesRef.current) {
        if (queuedTeamSaveFailedRef.current) {
          boardRef.current = confirmedBoardRef.current;
          setBoard(confirmedBoardRef.current);
        }
        queuedTeamSaveFailedRef.current = false;
        teamSaveActiveRef.current = false;
        operationRef.current = false;
        setBusy(false);
      }
    });
  };
  const updateStaticDraft = next => {
    if (role === 'Viewer' || operationRef.current) return false;
    const updated = normalizeStaticBoard(typeof next === 'function' ? next(staticDraft) : next);
    const validationError = boardError(updated, { allowUnlimitedParties: true });
    if (validationError) { setError(validationError); return false; }
    setStaticDraft(updated); setError(''); return saveStaticTeams(updated);
  };
  const saveStaticTeams = async (draft = staticDraft) => {
    if (role === 'Viewer' || operationRef.current) return false;
    const before = normalizeStaticBoard(staticBoardRef.current);
    const updated = normalizeStaticBoard(draft);
    const validationError = boardError(updated, { allowUnlimitedParties: true });
    if (validationError) { setError(validationError); return false; }
    if (JSON.stringify(before) === JSON.stringify(updated)) return true;
    const expectedVersion = staticBoardVersionRef.current;
    const editId = crypto.randomUUID();
    localStaticEditRef.current = editId;
    operationRef.current = true; setBusy(true); setNotice('');
    try {
      if (firebaseEnabled) await runTransaction(db, async transaction => {
        const ref = doc(db, 'guilds', guildId, 'staticBoard', 'board');
        const saved = await transaction.get(ref);
        const current = normalizeStaticBoard(saved.exists() ? saved.data().teams : blankStaticBoard());
        const version = saved.exists() ? saved.data().boardEditId || null : null;
        if (version !== expectedVersion || JSON.stringify(current) !== JSON.stringify(before)) throw Object.assign(new Error('Static board changed'), { code: 'formation/conflict' });
        transaction.set(ref, { teams: serializeBoard(updated), boardEditId: editId, updatedAt: serverTimestamp() });
      });
      if (!firebaseEnabled || staticBoardVersionRef.current === expectedVersion || staticBoardVersionRef.current === editId) {
        staticBoardRef.current = updated; staticBoardVersionRef.current = editId; setStaticBoard(updated); setStaticDraft(updated);
      }
      setError(''); return true;
    } catch (failure) {
      if (failure.code === 'formation/conflict') setError('Another session changed the static board. Review the current board and try again.');
      else reportFailure();
      return false;
    } finally { operationRef.current = false; setBusy(false); }
  };
  const deleteMember = async id => {
    if (role === 'Viewer' || operationRef.current) return;
    const next = Object.fromEntries(Object.entries(teams).map(([key, parties]) => [key, parties.map(slots => slots.map(item => item === id ? null : item))]));
    const cleanedStatic = normalizeStaticBoard({ ...staticBoardRef.current, teams: Object.fromEntries(Object.entries(staticBoardRef.current.teams).map(([key, parties]) => [key, parties.map(slots => slots.map(item => item === id ? null : item))])) });
    if (!firebaseEnabled) { setMembers(current => current.filter(member => member.id !== id)); const cleaned = { ...boardRef.current, teams: next }; boardRef.current = cleaned; setBoard(cleaned); staticBoardRef.current = cleanedStatic; setStaticBoard(cleanedStatic); setStaticDraft(cleanedStatic); return; }
    let finalStatic = cleanedStatic;
    const staticEditId = crypto.randomUUID();
    const teamBoardDocs = await getDocs(collection(db, 'guilds', guildId, 'teamBoards'));
    const teamBoardRefs = teamBoardDocs.docs.filter(item => item.id !== boardMetaId).map(item => doc(db, 'guilds', guildId, 'teamBoards', item.id));
    localStaticEditRef.current = staticEditId;
    operationRef.current = true; setBusy(true);
    try {
      await runTransaction(db, async transaction => {
        const guildRef = doc(db, 'guilds', guildId);
        const saved = await transaction.get(guildRef);
        const staticRef = doc(db, 'guilds', guildId, 'staticBoard', 'board');
        const savedStatic = await transaction.get(staticRef);
        const currentTeamSnapshots = await Promise.all(teamBoardRefs.map(ref => transaction.get(ref)));
        const current = normalizeBoard(saved.data().teams);
        const cleaned = Object.fromEntries(Object.entries(current.teams).map(([lane, parties]) => [lane, parties.map(slots => slots.map(item => item === id ? null : item))]));
        const currentStatic = normalizeStaticBoard(savedStatic.exists() ? savedStatic.data().teams : blankStaticBoard());
        const cleanedStaticTeams = Object.fromEntries(Object.entries(currentStatic.teams).map(([lane, parties]) => [lane, parties.map(slots => slots.map(item => item === id ? null : item))]));
        finalStatic = { ...currentStatic, mode: 'guild-league', teams: cleanedStaticTeams };
        transaction.delete(doc(db, 'guilds', guildId, 'members', id));
        currentTeamSnapshots.forEach((snapshot, index) => {
          if (!snapshot.exists()) return;
          const parties = snapshot.data().parties || [];
          const nextParties = parties.map(party => ({ ...party, slots: party.slots.map(memberId => memberId === id ? null : memberId) }));
          if (JSON.stringify(parties) !== JSON.stringify(nextParties)) transaction.update(teamBoardRefs[index], { parties: nextParties, updatedAt: serverTimestamp() });
        });
        transaction.update(guildRef, { teams: serializeBoard({ ...current, teams: cleaned }), boardEditId: crypto.randomUUID(), updatedAt: serverTimestamp() });
        transaction.set(staticRef, { teams: serializeBoard(finalStatic), boardEditId: staticEditId, updatedAt: serverTimestamp() });
      });
      staticBoardRef.current = finalStatic; staticBoardVersionRef.current = staticEditId; setStaticBoard(finalStatic); setStaticDraft(finalStatic); setError('');
    } catch { reportFailure(); }
    finally { operationRef.current = false; setBusy(false); }
  };
  const autoBalance = async (status = 'all', preferences = null) => {
    const before = Object.values(boardRef.current.teams).flat(2).filter(Boolean).length;
    const subAssigned = boardRef.current.mode === 'guild-league'
      ? new Set(Object.values(boardRef.current.sub?.teams || {}).flat(2).filter(Boolean))
      : new Set();
    const eligibleMembers = members.filter(member => !subAssigned.has(member.id));
    const next = autoBalanceBoard(eligibleMembers, boardRef.current, status, preferences);
    const success = await saveTeams(next);
    if (success) {
      const filled = Object.values(next.teams).flat(2).filter(Boolean).length - before;
      const unfilled = Object.values(next.teams).flat(2).filter(id => !id).length;
      setNotice(`Filled ${filled} empty slot(s) using the highest-GS matching members.${unfilled ? ` ${unfilled} slot(s) remain empty because no matching available member was found.` : ''}`);
    }
    return success;
  };
  const autoBalanceStatic = async (status = 'all', preferences = null) => {
    const before = Object.values(staticDraft.teams).flat(2).filter(Boolean).length;
    const next = autoBalanceBoard(members, staticDraft, status, preferences);
    next.mode = 'guild-league';
    const success = await updateStaticDraft(next);
    if (success) {
      const filled = Object.values(next.teams).flat(2).filter(Boolean).length - before;
      const unfilled = Object.values(next.teams).flat(2).filter(id => !id).length;
      setNotice(`Filled ${filled} empty slot(s) using the highest-GS matching members.${unfilled ? ` ${unfilled} slot(s) remain empty because no matching available member was found.` : ''}`);
    }
    return success;
  };
  const clearTeams = () => saveTeams(blankBoard(boardRef.current.mode));
  const clearStaticTeams = () => updateStaticDraft(blankStaticBoard());
  const selectMode = mode => {
    if (mode === boardRef.current.mode) return;
    const next = changeBoardMode(boardRef.current, mode);
    const removedTeams = Object.values(boardRef.current.teams).flat().length - Object.values(next.teams).flat().length;
    if (removedTeams > 0 && !window.confirm(`Switch to ${BOARD_MODES[mode].name}? ${removedTeams} excess ${removedTeams === 1 ? 'party' : 'parties'} will be removed and their players returned to Available Members.`)) return;
    saveTeams(next);
  };
  const saveTeam = async (name, targetId = null, currentBoard = boardRef.current) => {
    if (role === 'Viewer' || operationRef.current || !name.trim() || name.trim().length > 80) return false;
    const boardToSave = normalizeBoard(currentBoard);
    const incomplete = formationSaveError(boardToSave, members);
    if (incomplete) { setError(incomplete); return false; }
    const existing = targetId ? savedTeams.find(item => item.id === targetId) : null;
    if (targetId && !existing) return false;
    const memberNameTeams = { ...boardToSave.teams, ...Object.fromEntries(Object.entries(boardToSave.sub?.teams || {}).map(([id, parties]) => [`sub:${id}`, parties])) };
    const snapshot = { id: targetId || crypto.randomUUID(), name: name.trim(), createdAt: existing?.createdAt || new Date().toISOString(), ...boardToSave, memberNames: formationMemberNames(memberNameTeams, members) };
    operationRef.current = true; setBusy(true); setNotice('');
    try {
      if (firebaseEnabled) {
        const ref = doc(db, 'guilds', guildId, 'savedTeams', snapshot.id);
        if (targetId) await runTransaction(db, async transaction => {
          const current = await transaction.get(ref);
          if (!current.exists()) throw new Error('Save slot no longer exists');
          transaction.update(ref, { name: snapshot.name, teams: serializeBoard(snapshot), memberNames: snapshot.memberNames, updatedAt: new Date().toISOString() });
        });
        else await setDoc(ref, { ...snapshot, ownerId: guild.ownerId, createdBy: user.uid, teams: serializeBoard(snapshot) });
      } else setSavedTeams(current => targetId ? current.map(item => item.id === targetId ? snapshot : item) : [snapshot, ...current]);
      setActiveSaveId(snapshot.id);
      if (targetId && targetId === loadedSaveId) setLoadedSaveId(targetId);
      else setLoadedSaveId(null);
      setError(''); setNotice(`${targetId ? 'Updated' : 'Saved'} formation "${snapshot.name}" in your workspace playbook.`); return true;
    } catch { reportFailure(); return false; }
    finally { operationRef.current = false; setBusy(false); }
  };
  const loadTeam = async snapshot => {
    const saved = normalizeBoard(snapshot);
    const prepared = prepareFormation(saved.teams, members, saved.groupNames, saved.teamNames, snapshot.memberNames);
    const success = await saveTeams({ ...saved, teams: prepared.teams }, { skipLoadedAutoSave: true });
    if (success) { setActiveSaveId(snapshot.id); setLoadedSaveId(snapshot.id); }
    if (success) setNotice([
      `Loaded "${snapshot.name}".`,
      ...(prepared.missing ? ['Members no longer in the current roster were removed from these slots:'] : []),
      ...prepared.missingParties.map(({ team, party, count }) => `${team} / ${party} is missing ${count} ${count === 1 ? 'member' : 'members'}. Fill the empty ${count === 1 ? 'slot' : 'slots'} with replacements.`),
      ...prepared.removedMembers.map(({ team, party, slot, name }) => `${team} / ${party}, slot ${slot}: ${name ? `Removed ${name}` : 'Removed member (name unavailable in this older save)'} - no longer in the roster.`),
      ...(prepared.duplicates ? [`${prepared.duplicates} duplicate assignment(s) were cleared.`] : []),
    ].join('\n'));
    return success;
  };
  const deleteSavedTeam = async id => {
    if (role === 'Viewer' || operationRef.current) return false;
    operationRef.current = true; setBusy(true); setNotice('');
    try { if (firebaseEnabled) await deleteDoc(doc(db, 'guilds', guildId, 'savedTeams', id)); else setSavedTeams(current => current.filter(snapshot => snapshot.id !== id)); if (id === activeSaveId) setActiveSaveId(null); if (id === loadedSaveId) setLoadedSaveId(null); setError(''); setNotice('Saved formation deleted. The active board is unchanged.'); return true; } catch { reportFailure(); return false; }
    finally { operationRef.current = false; setBusy(false); }
  };
  const safePage = memberTokenSession && page === 'settings' ? 'dashboard' : page;
  const active = safePage === 'settings' ? <Settings user={user} guild={guild} members={members} board={board} staticBoard={staticBoard} savedTeams={savedTeams} onWorkspaceChange={setWorkspace} onLogout={() => logout()} theme={theme} setTheme={setTheme} startPage={startPage} setStartPage={setStartPage} /> : safePage === 'dashboard' ? <Dashboard sharedReadOnly={guild?.sharedReadOnly || false} guildId={guildId} ownerId={guild?.ownerId} guildName={guild?.name || 'Local demo'} members={members} teams={teams} onImport={importMembers} role={role} /> : safePage === 'members' ? <RosterDashboard members={members} /> : safePage === 'static' ? <Teams staticOnly guildName={guild?.name || 'Local demo'} members={members} teams={staticDraft.teams} mode="guild-league" teamNames={staticDraft.teamNames} groupNames={staticDraft.groupNames} onTeamsChange={updateStaticDraft} editable={role !== 'Viewer'} generate={autoBalanceStatic} clear={clearStaticTeams} busy={busy} /> : safePage === 'attendance' ? <Attendance members={members} rows={attendanceRows} onAppend={appendAttendance} onReset={resetAttendance} editable={role !== 'Viewer'} busy={busy} /> : <Teams guildName={guild?.name || 'Local demo'} members={members} teams={teams} mode={board.mode} teamNames={board.teamNames} groupNames={board.groupNames} board={board} staticParties={staticBoard.teams} staticPartyNames={staticBoard.teamNames} activeUsers={activeTeamBuilderUsers} selectMode={selectMode} onTeamsChange={saveTeams} editable={role !== 'Viewer'} generate={autoBalance} clear={clearTeams} save={saveTeam} activeSaveId={activeSaveId} loadedSaveId={loadedSaveId} loadedSaveName={savedTeams.find(item => item.id === loadedSaveId)?.name} onDetachLoadedSave={() => { setLoadedSaveId(null); setActiveSaveId(null); }} savedTeams={savedTeams} load={loadTeam} deleteSaved={deleteSavedTeam} busy={busy} />;
  const logout = async () => { try { if (firebaseEnabled) await signOut(auth); else exitDemo(); } catch { setError('Could not sign out. Please try again.'); } };
  return <div className="workspace-frame"><Navbar page={safePage} setPage={setPage} role={role} memberCount={members.length} user={user} guild={guild} onLogout={logout} hideSettings={memberTokenSession} notifications={notifications} clearNotifications={() => setNotifications([])} /><div className="app-shell">{!firebaseEnabled && <p className="demo-banner">Local demo — data stays in this browser. No online account is created.</p>}{error && <p className="workspace-error" role="alert">{error}</p>}{loaded ? active : <p className="workspace-loading" role="status">Loading your workspace…</p>}</div></div>;
}

