import { collection, doc, getDoc, getDocs, serverTimestamp, writeBatch } from 'firebase/firestore';
import { blankBoard, blankStaticBoard, normalizeBoard, normalizeStaticBoard, serializeBoard } from './board.js';
import { formationMemberNames, prepareFormation } from './teams.js';

export function prepareRosterImport(roster, existingMembers) {
  const existingByName = new Map(existingMembers.map(member => [member.ign.trim().toLowerCase(), member.id]));
  const seen = new Set();
  const members = [];
  for (const member of roster) {
    const ign = member.ign.trim();
    const sourceId = String(member.sourceId || '').trim();
    const key = sourceId ? `id:${sourceId}` : `name:${ign.toLowerCase()}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    // The IGN is the durable identity for assignments. Source IDs may be reused
    // by roster exports, so a changed name must receive a new member ID.
    const id = existingByName.get(ign.toLowerCase());
    members.push({ ...member, sourceId, ign, id: id || crypto.randomUUID() });
  }
  return { members, duplicates: roster.length - members.length };
}

export function reconcileSavedFormation(value, members, previousMembers, previousNames = {}) {
  const board = normalizeBoard(value);
  const previousMainNames = formationMemberNames(board.teams, previousMembers, previousNames);
  const main = prepareFormation(board.teams, members, board.groupNames, board.teamNames, previousMainNames);
  let sub = null;
  let subNames = {};
  const removedMembers = main.removedMembers.map(member => ({ ...member, side: 'MAIN' }));
  if (board.sub) {
    const previousSubNames = formationMemberNames(board.sub.teams, previousMembers, previousNames);
    const mainIds = new Set(Object.values(main.teams).flat(2).filter(Boolean));
    sub = prepareFormation(board.sub.teams, members.filter(member => !mainIds.has(member.id)), board.sub.groupNames, board.sub.teamNames, previousSubNames);
    removedMembers.push(...sub.removedMembers.map(member => ({ ...member, side: 'SUB' })));
    subNames = previousSubNames;
  }
  return {
    board: { ...board, teams: main.teams, sub: sub ? { ...board.sub, teams: sub.teams } : null },
    memberNames: { ...previousMainNames, ...subNames },
    removedMembers,
  };
}

export async function replaceGuildRoster(db, guildId, roster) {
  const staticRef = doc(db, 'guilds', guildId, 'staticBoard', 'board');
  const [current, guild, saves, teamBoards, savedStatic] = await Promise.all([getDocs(collection(db, 'guilds', guildId, 'members')), getDoc(doc(db, 'guilds', guildId)), getDocs(collection(db, 'guilds', guildId, 'savedTeams')), getDocs(collection(db, 'guilds', guildId, 'teamBoards')), getDoc(staticRef)]);
  const previousMembers = current.docs.map(item => ({ ...item.data(), id: item.id }));
  const prepared = prepareRosterImport(roster, previousMembers);
  const staticBoard = normalizeStaticBoard(savedStatic.exists() ? savedStatic.data().teams : blankStaticBoard());
  const previousStaticNames = formationMemberNames(staticBoard.teams, previousMembers);
  const reconciledStatic = prepareFormation(staticBoard.teams, prepared.members, staticBoard.groupNames, staticBoard.teamNames, previousStaticNames);
  const nextStatic = { ...staticBoard, teams: reconciledStatic.teams };
  const activeMeta = teamBoards.docs.find(item => item.id === '_meta')?.data() || {};
  const activeBoard = normalizeBoard({
    mode: activeMeta.mode || normalizeBoard(guild.data()?.teams).mode,
    sub: activeMeta.sub,
    teams: { groups: teamBoards.docs.filter(item => item.id !== '_meta').sort((a, b) => (a.data().order ?? Number.MAX_SAFE_INTEGER) - (b.data().order ?? Number.MAX_SAFE_INTEGER)).map(item => ({ id: item.id, name: item.data().name || '', parties: item.data().parties || [] })) },
  });
  const reconciledActive = reconcileSavedFormation(activeBoard, prepared.members, previousMembers);
  const removedActiveMembers = reconciledActive.removedMembers.map(member => ({ ...member, formationName: 'Active Team Builder' }));
  const retained = new Set(prepared.members.map(member => member.id));
  const batch = writeBatch(db);
  // Clean departed members out of every saved battle mode and both Guild League sides.
  const removedSavedMembers = [];
  saves.docs.forEach(item => {
    const saved = item.data();
    const reconciled = reconcileSavedFormation(saved.teams, prepared.members, previousMembers, saved.memberNames);
    removedSavedMembers.push(...reconciled.removedMembers.map(member => ({ ...member, formationName: saved.name || 'Saved formation' })));
    if (JSON.stringify(reconciled.memberNames) !== JSON.stringify(saved.memberNames || {}) || JSON.stringify(serializeBoard(reconciled.board)) !== JSON.stringify(saved.teams)) {
      batch.update(item.ref, { teams: serializeBoard(reconciled.board), memberNames: reconciled.memberNames });
    }
  });
  // Update retained players in place instead of deleting and recreating them.
  current.docs.filter(item => !retained.has(item.id)).forEach(item => batch.delete(item.ref));
  prepared.members.forEach(member => batch.set(doc(db, 'guilds', guildId, 'members', member.id), member));
  const boardEditId = crypto.randomUUID();
  const boardMode = normalizeBoard(guild.data()?.teams).mode;
  teamBoards.docs.filter(item => item.id !== '_meta').forEach(item => batch.delete(item.ref));
  batch.set(doc(db, 'guilds', guildId, 'teamBoards', '_meta'), { mode: boardMode, schemaVersion: 1, updatedAt: serverTimestamp() });
  batch.update(doc(db, 'guilds', guildId), { teams: serializeBoard(blankBoard(boardMode)), boardEditId, updatedAt: serverTimestamp() });
  const staticBoardEditId = crypto.randomUUID();
  batch.set(staticRef, { teams: serializeBoard(nextStatic), boardEditId: staticBoardEditId, updatedAt: serverTimestamp() });
  // Roster replacement, event-board reset and static-member reconciliation are atomic.
  await batch.commit();
  return { added: prepared.members.length, duplicates: prepared.duplicates, boardEditId, staticBoardEditId, staticBoard: nextStatic, removedStaticMembers: reconciledStatic.removedMembers, removedSavedMembers, removedActiveMembers };
}

export function describeImportError(error) {
  const code = String(error?.code || '').replace(/^firestore\//, '');
  if (code === 'permission-denied') return 'Import denied by Firebase (permission-denied). Publish the latest firestore.rules in Firebase Console → Firestore Database → Rules, then retry. If using a member token, check that it has not expired or been revoked.';
  if (code === 'unauthenticated') return 'Your login session has ended (unauthenticated). Sign in again, then retry the import.';
  if (['unavailable', 'deadline-exceeded'].includes(code)) return `Firebase could not be reached (${code}). Check your internet connection, then retry.`;
  if (code === 'resource-exhausted') return 'Firebase rejected the import because a quota or request limit was reached (resource-exhausted). Try again later or check your Firebase usage.';
  if (code === 'import/busy') return 'Another change is still saving. Wait for it to finish, then upload the CSV again.';
  if (code === 'invalid-argument') return 'Firebase rejected the roster data (invalid-argument). Check the CSV format and file size, then retry.';
  return `Import failed${code ? ` (${code})` : ''}. Retry the upload${code ? ' or share this error code for troubleshooting' : ' and check that the CSV file can be read'}.`;
}
