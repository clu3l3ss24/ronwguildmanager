import { useEffect, useRef, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, runTransaction, serverTimestamp, setDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import Navbar from './components/Navbar'; import Dashboard from './pages/Dashboard'; import Members from './pages/Members'; import Teams from './pages/Teams';
import { auth, db, firebaseEnabled } from './firebase/config';
import Settings from './pages/Settings';
import AccountGate from './components/AccountGate';
import { advanceHistory, emptyHistory, formationMemberNames, prepareFormation } from './firebase/teams';
import { autoBalanceBoard, blankBoard, boardError, BOARD_MODES, changeBoardMode, formationSaveError, normalizeBoard, serializeBoard } from './firebase/board';
import { prepareRosterImport, replaceGuildRoster } from './firebase/importRoster';

const seedMembers = [];
const stored = key => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
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
  guild = workspace;
  role = user?.isAnonymous ? ((tokenPermission || (guild?.sharedReadOnly ? 'view' : 'edit')) === 'view' ? 'Viewer' : 'Collaborator') : 'Account owner';
  const [startPage, setStartPage] = useState(() => { const saved = localStorage.getItem('ronw-start-page'); return ['dashboard', 'members', 'teams'].includes(saved) ? saved : 'dashboard'; });
  useEffect(() => { localStorage.setItem('ronw-start-page', startPage); }, [startPage]);
  const [page, setPage] = useState(startPage);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(!firebaseEnabled);
  const [members, setMembers] = useState(() => firebaseEnabled ? [] : stored('row-members') || seedMembers);
  const [board, setBoard] = useState(() => normalizeBoard(firebaseEnabled ? blankBoard() : stored('row-teams') || blankBoard()));
  const teams = board.teams;
  const [savedTeams, setSavedTeams] = useState(() => firebaseEnabled ? [] : (stored('row-saved-teams') || []).map(item => ({ ...item, ...normalizeBoard(item) })));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [activeSaveId, setActiveSaveId] = useState(null);
  const [history, setHistory] = useState(emptyHistory);
  const historyRef = useRef(history);
  const boardRef = useRef(board);
  const boardVersionRef = useRef(null);
  const localEditRef = useRef(null);
  const operationRef = useRef(false);
  const updateHistory = next => { historyRef.current = next; setHistory(next); };
  const guildId = guild?.id;
  useEffect(() => {
    if (!firebaseEnabled) return;
    let active = true;
    const ready = new Set();
    const mark = key => { ready.add(key); if (active && ready.size === 3) setLoaded(true); };
    const failed = () => { if (active) setError('Could not load your workspace. Check your connection and Firestore rules, then reload.'); };
    const unsubscribers = [
      onSnapshot(collection(db, 'guilds', guildId, 'members'), snap => { if (active) { setMembers(snap.docs.map(item => ({ ...item.data(), id: item.id }))); mark('members'); } }, failed),
      onSnapshot(doc(db, 'guilds', guildId), snap => { if (active && snap.exists()) {
        setWorkspace(current => ({ ...current, ...snap.data() }));
        const next = normalizeBoard(snap.data().teams);
        const version = snap.data().boardEditId || null;
        const changed = JSON.stringify(next) !== JSON.stringify(boardRef.current) || version !== boardVersionRef.current;
        if (ready.has('teams') && changed && version !== localEditRef.current) {
          updateHistory(emptyHistory());
          setNotice('The shared board was updated in another session. Undo history has been reset.');
        }
        boardRef.current = next; boardVersionRef.current = version; setBoard(next); mark('teams');
      } }, failed),
      onSnapshot(collection(db, 'guilds', guildId, 'savedTeams'), snap => { if (active) { setSavedTeams(snap.docs.map(item => ({ ...item.data(), id: item.id, ...normalizeBoard(item.data().teams) })).sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt)))); mark('saved'); } }, failed),
    ];
    return () => { active = false; unsubscribers.forEach(unsubscribe => unsubscribe()); };
  }, [guildId]);
  useEffect(() => { if (!firebaseEnabled) localStorage.setItem('row-members', JSON.stringify(members)); }, [members]);
  useEffect(() => { if (!firebaseEnabled) localStorage.setItem('row-saved-teams', JSON.stringify(savedTeams)); }, [savedTeams]);
  useEffect(() => { if (!firebaseEnabled) localStorage.setItem('row-teams', JSON.stringify(board)); }, [board]);
  const importMembers = async roster => {
    if (role !== 'Account owner') throw Object.assign(new Error(), { code: 'permission-denied' });
    if (operationRef.current) throw Object.assign(new Error(), { code: 'import/busy' });
    operationRef.current = true; setBusy(true);
    try {
      let result;
      if (firebaseEnabled) result = await replaceGuildRoster(db, guildId, roster);
      else {
        const prepared = prepareRosterImport(roster, members);
        setSavedTeams(current => current.map(snapshot => ({ ...snapshot, memberNames: formationMemberNames(snapshot.teams, members, snapshot.memberNames) })));
        setMembers(prepared.members); const cleared = blankBoard(board.mode); boardRef.current = cleared; setBoard(cleared);
        result = { added: prepared.members.length, duplicates: prepared.duplicates };
      }
      updateHistory(emptyHistory()); setError(''); setNotice(''); return result;
    } finally { operationRef.current = false; setBusy(false); }
  };
  const reportFailure = () => setError('Your change could not be saved. Check your connection and try again.');
  const saveTeams = async (next, action = 'edit') => {
    if (role === 'Viewer' || operationRef.current) return false;
    const before = normalizeBoard(boardRef.current);
    const updated = normalizeBoard(typeof next === 'function' ? next(before) : next);
    const validationError = boardError(updated);
    if (validationError) { setError(validationError); return false; }
    if (JSON.stringify(before) === JSON.stringify(updated)) return true;
    const previousHistory = historyRef.current;
    const expectedVersion = boardVersionRef.current;
    const editId = crypto.randomUUID();
    localEditRef.current = editId;
    operationRef.current = true; setBusy(true); setNotice('');
    try {
      if (firebaseEnabled) await runTransaction(db, async transaction => {
        const ref = doc(db, 'guilds', guildId);
        const saved = await transaction.get(ref);
        if (!saved.exists() || (saved.data().boardEditId || null) !== expectedVersion || JSON.stringify(normalizeBoard(saved.data().teams)) !== JSON.stringify(before)) throw Object.assign(new Error('Board changed'), { code: 'formation/conflict' });
        transaction.update(ref, { teams: serializeBoard(updated), boardEditId: editId, updatedAt: serverTimestamp() });
      });
      if (!firebaseEnabled || boardVersionRef.current === expectedVersion || boardVersionRef.current === editId) {
        boardRef.current = updated; boardVersionRef.current = editId; setBoard(updated);
        updateHistory(advanceHistory(previousHistory, before, updated, action));
      }
      setError(''); return true;
    } catch (failure) {
      if (failure.code === 'formation/conflict') { updateHistory(emptyHistory()); setError('Another session changed the board. Your change was not applied. Review the current board and try again.'); }
      else reportFailure();
      return false;
    } finally { operationRef.current = false; setBusy(false); }
  };
  const deleteMember = async id => {
    if (role !== 'Account owner' || operationRef.current) return;
    const next = Object.fromEntries(Object.entries(teams).map(([key, parties]) => [key, parties.map(slots => slots.map(item => item === id ? null : item))]));
    if (!firebaseEnabled) { setMembers(current => current.filter(member => member.id !== id)); const cleaned = { ...boardRef.current, teams: next }; boardRef.current = cleaned; setBoard(cleaned); updateHistory(emptyHistory()); return; }
    operationRef.current = true; setBusy(true);
    try {
      await runTransaction(db, async transaction => {
        const guildRef = doc(db, 'guilds', guildId);
        const saved = await transaction.get(guildRef);
        const current = normalizeBoard(saved.data().teams);
        const cleaned = Object.fromEntries(Object.entries(current.teams).map(([lane, parties]) => [lane, parties.map(slots => slots.map(item => item === id ? null : item))]));
        transaction.delete(doc(db, 'guilds', guildId, 'members', id));
        transaction.update(guildRef, { teams: serializeBoard({ ...current, teams: cleaned }), boardEditId: crypto.randomUUID(), updatedAt: serverTimestamp() });
      });
      updateHistory(emptyHistory()); setError('');
    } catch { reportFailure(); }
    finally { operationRef.current = false; setBusy(false); }
  };
  const autoBalance = async (status = 'all', preferences = null) => {
    const before = Object.values(boardRef.current.teams).flat(2).filter(Boolean).length;
    const next = autoBalanceBoard(members, boardRef.current, status, preferences);
    const success = await saveTeams(next);
    if (success) {
      const filled = Object.values(next.teams).flat(2).filter(Boolean).length - before;
      const unfilled = Object.values(next.teams).flat(2).filter(id => !id).length;
      setNotice(`Filled ${filled} empty slot(s) using the highest-GS matching members.${unfilled ? ` ${unfilled} slot(s) remain empty because no matching available member was found.` : ''}`);
    }
    return success;
  };
  const clearTeams = () => saveTeams(blankBoard(boardRef.current.mode));
  const selectMode = mode => {
    if (mode === boardRef.current.mode) return;
    const next = changeBoardMode(boardRef.current, mode);
    const removedTeams = Object.values(boardRef.current.teams).flat().length - Object.values(next.teams).flat().length;
    if (removedTeams > 0 && !window.confirm(`Switch to ${BOARD_MODES[mode].name}? ${removedTeams} excess ${removedTeams === 1 ? 'party' : 'parties'} will be removed and their players returned to Available Members. You can undo this change.`)) return;
    saveTeams(next);
  };
  const saveTeam = async (name, targetId = null) => {
    if (role === 'Viewer' || operationRef.current || !name.trim() || name.trim().length > 80) return false;
    const incomplete = formationSaveError(boardRef.current, members);
    if (incomplete) { setError(incomplete); return false; }
    const existing = targetId ? savedTeams.find(item => item.id === targetId) : null;
    if (targetId && !existing) return false;
    const snapshot = { id: targetId || crypto.randomUUID(), name: name.trim(), createdAt: existing?.createdAt || new Date().toISOString(), ...normalizeBoard(boardRef.current), memberNames: formationMemberNames(boardRef.current.teams, members) };
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
      setError(''); setNotice(`${targetId ? 'Updated' : 'Saved'} formation "${snapshot.name}" in your workspace playbook.`); return true;
    } catch { reportFailure(); return false; }
    finally { operationRef.current = false; setBusy(false); }
  };
  const loadTeam = async snapshot => {
    const saved = normalizeBoard(snapshot);
    const prepared = prepareFormation(saved.teams, members, saved.groupNames, saved.teamNames, snapshot.memberNames);
    const success = await saveTeams({ ...saved, teams: prepared.teams });
    if (success) setActiveSaveId(snapshot.id);
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
    try { if (firebaseEnabled) await deleteDoc(doc(db, 'guilds', guildId, 'savedTeams', id)); else setSavedTeams(current => current.filter(snapshot => snapshot.id !== id)); setError(''); setNotice('Saved formation deleted. The active board is unchanged.'); return true; } catch { reportFailure(); return false; }
    finally { operationRef.current = false; setBusy(false); }
  };
  const undo = () => { const previous = historyRef.current.past.at(-1); if (previous) saveTeams(previous, 'undo'); };
  const redo = () => { const next = historyRef.current.future.at(-1); if (next) saveTeams(next, 'redo'); };
  const active = page === 'settings' ? <Settings user={user} guild={guild} members={members} board={board} savedTeams={savedTeams} onWorkspaceChange={setWorkspace} onLogout={() => logout()} theme={theme} setTheme={setTheme} startPage={startPage} setStartPage={setStartPage} /> : page === 'dashboard' ? <Dashboard sharedReadOnly={guild?.sharedReadOnly || false} guildId={guildId} ownerId={guild?.ownerId} guildName={guild?.name || 'Local demo'} members={members} teams={teams} onImport={importMembers} role={role} /> : page === 'members' ? <Members members={members} onDelete={deleteMember} canDelete={role === 'Account owner'} /> : <Teams guildName={guild?.name || 'Local demo'} members={members} teams={teams} mode={board.mode} teamNames={board.teamNames} groupNames={board.groupNames} selectMode={selectMode} onTeamsChange={saveTeams} editable={role !== 'Viewer'} generate={autoBalance} clear={clearTeams} save={saveTeam} activeSaveId={activeSaveId} savedTeams={savedTeams} load={loadTeam} deleteSaved={deleteSavedTeam} busy={busy} notice={notice} undo={undo} redo={redo} canUndo={history.past.length > 0} canRedo={history.future.length > 0} />;
  const logout = async () => { try { if (firebaseEnabled) await signOut(auth); else exitDemo(); } catch { setError('Could not sign out. Please try again.'); } };
  return <div className="workspace-frame"><Navbar page={page} setPage={setPage} role={role} memberCount={members.length} user={user} guild={guild} onLogout={logout} /><div className="app-shell">{!firebaseEnabled && <p className="demo-banner">Local demo — data stays in this browser. No online account is created.</p>}{error && <p className="workspace-error" role="alert">{error}</p>}{loaded ? active : <p className="workspace-loading" role="status">Loading your workspace…</p>}</div></div>;
}

