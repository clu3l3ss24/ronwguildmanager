import { collection, doc, getDoc, getDocs, serverTimestamp, writeBatch } from 'firebase/firestore';
import { blankBoard, blankStaticBoard, normalizeBoard, serializeBoard } from './board.js';
import { formationMemberNames } from './teams.js';

export function prepareRosterImport(roster, existingMembers) {
  const existing = new Map(existingMembers.map(member => [member.ign.trim().toLowerCase(), member.id]));
  const seen = new Set();
  const members = [];
  for (const member of roster) {
    const ign = member.ign.trim();
    const key = ign.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    members.push({ ...member, ign, id: existing.get(key) || crypto.randomUUID() });
  }
  return { members, duplicates: roster.length - members.length };
}

export async function replaceGuildRoster(db, guildId, roster) {
  const [current, guild, saves, teamBoards] = await Promise.all([getDocs(collection(db, 'guilds', guildId, 'members')), getDoc(doc(db, 'guilds', guildId)), getDocs(collection(db, 'guilds', guildId, 'savedTeams')), getDocs(collection(db, 'guilds', guildId, 'teamBoards'))]);
  const previousMembers = current.docs.map(item => ({ ...item.data(), id: item.id }));
  const prepared = prepareRosterImport(roster, previousMembers);
  const retained = new Set(prepared.members.map(member => member.id));
  const batch = writeBatch(db);
  // Preserve names in older saves before departing players are deleted.
  saves.docs.forEach(item => {
    const saved = item.data();
    const memberNames = formationMemberNames(normalizeBoard(saved.teams).teams, previousMembers, saved.memberNames);
    if (JSON.stringify(memberNames) !== JSON.stringify(saved.memberNames || {})) batch.update(item.ref, { memberNames });
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
  batch.set(doc(db, 'guilds', guildId, 'staticBoard', 'board'), { teams: serializeBoard(blankStaticBoard()), boardEditId: staticBoardEditId, updatedAt: serverTimestamp() });
  // Roster replacement and both board resets succeed together or leave all unchanged.
  await batch.commit();
  return { added: prepared.members.length, duplicates: prepared.duplicates, boardEditId, staticBoardEditId };
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
