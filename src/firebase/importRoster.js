import { collection, doc, getDoc, getDocs, serverTimestamp, writeBatch } from 'firebase/firestore';
import { blankStaticBoard, normalizeBoard, normalizeStaticBoard, serializeBoard } from './board.js';
import { formationMemberNames, prepareFormation } from './teams.js';

export function prepareRosterImport(roster, existingMembers) {
  const existingByName = new Map(existingMembers.map(member => [member.ign.trim().toLowerCase(), member]));
  const seen = new Set();
  const members = [];
  const importedAt = new Date().toISOString();
  for (const member of roster) {
    const ign = member.ign.trim();
    const sourceId = String(member.sourceId || '').trim();
    const key = sourceId ? `id:${sourceId}` : `name:${ign.toLowerCase()}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    // The IGN is the durable identity for assignments. Source IDs may be reused
    // by roster exports, so a changed name must receive a new member ID.
    const previous = existingByName.get(ign.toLowerCase());
    const id = previous?.id;
    const online = member.online === true;
    const offlineSince = online ? null : Number.isFinite(member.offlineDays)
      ? new Date(Date.parse(importedAt) - member.offlineDays * 24 * 60 * 60 * 1000).toISOString()
      : previous?.online === false && previous.offlineSince ? previous.offlineSince : importedAt;
    members.push({ ...member, sourceId, ign, id: id || crypto.randomUUID(), online, offlineSince });
  }
  const offlineCutoff = Date.now() - 3 * 24 * 60 * 60 * 1000;
  const offlineMembers = members.filter(member => {
    if (member.online) return false;
    const offlineSinceMillis = Date.parse(member.offlineSince);
    return (Number.isFinite(member.offlineDays) && member.offlineDays >= 3) || (Number.isFinite(offlineSinceMillis) && offlineSinceMillis <= offlineCutoff);
  }).map(member => member.ign);
  return { members, duplicates: roster.length - members.length, offlineMembers };
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
  const [current, saves, savedStatic, modeBoards] = await Promise.all([getDocs(collection(db, 'guilds', guildId, 'members')), getDocs(collection(db, 'guilds', guildId, 'savedTeams')), getDoc(staticRef), getDocs(collection(db, 'guilds', guildId, 'teamBoardsByMode'))]);
  const previousMembers = current.docs.map(item => ({ ...item.data(), id: item.id }));
  const prepared = prepareRosterImport(roster, previousMembers);
  const staticBoard = normalizeStaticBoard(savedStatic.exists() ? savedStatic.data().teams : blankStaticBoard());
  const previousStaticNames = formationMemberNames(staticBoard.teams, previousMembers);
  const reconciledStatic = prepareFormation(staticBoard.teams, prepared.members, staticBoard.groupNames, staticBoard.teamNames, previousStaticNames);
  const nextStatic = { ...staticBoard, teams: reconciledStatic.teams };
  const removedActiveMembers = [];
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
  modeBoards.docs.forEach(item => {
    const reconciled = reconcileSavedFormation(item.data(), prepared.members, previousMembers);
    removedActiveMembers.push(...reconciled.removedMembers.map(member => ({ ...member, formationName: `Active Team Builder · ${item.id}` })));
    batch.set(item.ref, { ...serializeBoard(reconciled.board), updatedAt: serverTimestamp() });
  });
  const boardEditId = crypto.randomUUID();
  const staticBoardEditId = crypto.randomUUID();
  batch.set(staticRef, { teams: serializeBoard(nextStatic), boardEditId: staticBoardEditId, updatedAt: serverTimestamp() });
  // Roster replacement, event-board reset and static-member reconciliation are atomic.
  await batch.commit();
  return { added: prepared.members.length, duplicates: prepared.duplicates, boardEditId, staticBoardEditId, staticBoard: nextStatic, removedStaticMembers: reconciledStatic.removedMembers, removedSavedMembers, removedActiveMembers, offlineMembers: prepared.offlineMembers };
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
