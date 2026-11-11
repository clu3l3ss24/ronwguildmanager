import { after, before, beforeEach, test } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, Timestamp, updateDoc, where, writeBatch } from 'firebase/firestore';
import { describeImportError, replaceGuildRoster } from '../src/firebase/importRoster.js';

let env;
const hashA = 'a'.repeat(64);
const hashB = 'b'.repeat(64);
const leader = uid => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'password' } }).firestore();
const member = uid => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } }).firestore();
const session = (guildId = 'leader-a', tokenHash = hashA) => ({ guildId, tokenHash, joinedAt: serverTimestamp() });
const token = (guildId = 'leader-a') => ({ guildId, ownerId: guildId, name: 'Guild members', createdAt: serverTimestamp(), expiresAt: Timestamp.fromMillis(Date.now() + 86400000) });

before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-ronw-tests', firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') } });
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    for (const uid of ['leader-a', 'leader-b']) {
      await setDoc(doc(db, 'guilds', uid), { name: uid, ownerId: uid, teams: { top: [] }, createdAt: Timestamp.now() });
      await setDoc(doc(db, 'guilds', uid, 'members', 'player'), { ign: 'Player', gearScore: 100 });
      await setDoc(doc(db, 'guilds', uid, 'savedTeams', 'formation'), { name: 'Defense', ownerId: uid, teams: { top: [] } });
    }
    await setDoc(doc(db, 'memberTokens', hashA), token());
    await setDoc(doc(db, 'memberTokens', hashB), token('leader-b'));
  });
});
after(async () => { await env?.cleanup(); });

test('leaders can create tokens only for their own guild', async () => {
  await assertSucceeds(setDoc(doc(leader('leader-a'), 'memberTokens', 'c'.repeat(64)), token()));
  await assertFails(setDoc(doc(leader('leader-a'), 'memberTokens', 'd'.repeat(64)), token('leader-b')));
  await assertFails(setDoc(doc(member('viewer'), 'memberTokens', 'e'.repeat(64)), token()));
});
test('only leaders can list their guild tokens', async () => {
  await assertSucceeds(getDocs(query(collection(leader('leader-a'), 'memberTokens'), where('guildId', '==', 'leader-a'))));
  await assertFails(getDocs(collection(leader('leader-a'), 'memberTokens')));
  await assertFails(getDocs(collection(member('viewer'), 'memberTokens')));
  await assertFails(getDocs(query(collection(member('viewer'), 'memberTokens'), where('guildId', '==', 'leader-a'))));
  await assertSucceeds(setDoc(doc(member('viewer'), 'memberSessions', 'viewer'), session()));
  await assertFails(getDocs(query(collection(member('viewer'), 'memberTokens'), where('guildId', '==', 'leader-a'))));
  await assertFails(getDocs(query(collection(member('viewer'), 'memberTokens'), where('guildId', '==', 'leader-b'))));
});
test('a valid token grants leader-equivalent guild management access', async () => {
  const db = member('viewer');
  await assertSucceeds(getDoc(doc(db, 'memberTokens', hashA)));
  await assertSucceeds(setDoc(doc(db, 'memberSessions', 'viewer'), session()));
  await assertSucceeds(getDoc(doc(db, 'guilds', 'leader-a')));
  await assertSucceeds(getDocs(collection(db, 'guilds', 'leader-a', 'members')));
  await assertSucceeds(getDocs(collection(db, 'guilds', 'leader-a', 'savedTeams')));
  await assertSucceeds(updateDoc(doc(db, 'guilds', 'leader-a'), { teams: {}, updatedAt: serverTimestamp() }));
  await assertSucceeds(setDoc(doc(db, 'guilds', 'leader-a', 'members', 'new'), { ign: 'New player' }));
  await assertSucceeds(deleteDoc(doc(db, 'guilds', 'leader-a', 'members', 'player')));
  await assertSucceeds(setDoc(doc(db, 'guilds', 'leader-a', 'savedTeams', 'new'), { name: 'Defense', ownerId: 'leader-a' }));
  await assertSucceeds(updateDoc(doc(db, 'guilds', 'leader-a', 'savedTeams', 'formation'), { name: 'Updated defense' }));
  await assertSucceeds(deleteDoc(doc(db, 'guilds', 'leader-a', 'savedTeams', 'formation')));
  await assertFails(updateDoc(doc(db, 'guilds', 'leader-a'), { ownerId: 'viewer', updatedAt: serverTimestamp() }));
  await assertFails(setDoc(doc(db, 'guilds', 'leader-b', 'members', 'new'), { ign: 'Wrong guild' }));
});
test('token sessions cannot create or revoke tokens', async () => {
  const db = member('viewer');
  await assertSucceeds(setDoc(doc(db, 'memberSessions', 'viewer'), session()));
  const newHash = 'e'.repeat(64);
  await assertFails(setDoc(doc(db, 'memberTokens', newHash), { ...token(), expiresAt: Timestamp.fromMillis(Date.now() + 3600000) }));
  await assertFails(setDoc(doc(db, 'memberTokens', 'f'.repeat(64)), { ...token(), expiresAt: Timestamp.fromMillis(Date.now() + 2 * 86400000) }));
  await assertFails(setDoc(doc(db, 'memberTokens', 'c'.repeat(64)), token('leader-b')));
  await assertFails(deleteDoc(doc(db, 'memberTokens', hashB)));
  await assertFails(deleteDoc(doc(db, 'memberTokens', hashA)));
});

test('recoverable tokens are readable only by the owning leader and are removed on revocation', async () => {
  const owner = leader('leader-a');
  const ref = doc(owner, 'guilds', 'leader-a', 'tokenSecrets', hashA);
  await assertSucceeds(setDoc(ref, { token: `RONW-${'1'.repeat(64)}` }));
  await assertSucceeds(getDoc(ref));
  await assertFails(getDoc(doc(leader('leader-b'), 'guilds', 'leader-a', 'tokenSecrets', hashA)));
  const viewer = member('viewer');
  await assertSucceeds(setDoc(doc(viewer, 'memberSessions', 'viewer'), session()));
  await assertFails(getDoc(doc(viewer, 'guilds', 'leader-a', 'tokenSecrets', hashA)));
  await assertFails(getDocs(collection(viewer, 'guilds', 'leader-a', 'tokenSecrets')));
  await assertFails(setDoc(doc(viewer, 'guilds', 'leader-a', 'tokenSecrets', hashB), { token: `RONW-${'2'.repeat(64)}` }));
  await assertFails(deleteDoc(doc(viewer, 'guilds', 'leader-a', 'tokenSecrets', hashA)));
  const batch = writeBatch(owner);
  batch.delete(doc(owner, 'memberTokens', hashA)); batch.delete(ref);
  await assertSucceeds(batch.commit());
  assert.equal((await getDoc(ref)).exists(), false);
});
test('token users cannot read another guild or forge a different guild session', async () => {
  const db = member('viewer');
  await assertSucceeds(setDoc(doc(db, 'memberSessions', 'viewer'), session()));
  await assertFails(getDoc(doc(db, 'guilds', 'leader-b')));
  await assertFails(getDocs(collection(db, 'guilds', 'leader-b', 'members')));
  await assertFails(setDoc(doc(db, 'memberSessions', 'viewer'), session('leader-b')));
  await assertFails(setDoc(doc(db, 'memberSessions', 'someone-else'), session()));
  await assertFails(getDoc(doc(db, 'users', 'leader-a')));
});
test('revoking a token invalidates existing sessions on their next read', async () => {
  const db = member('viewer');
  await assertSucceeds(setDoc(doc(db, 'memberSessions', 'viewer'), session()));
  await assertSucceeds(getDoc(doc(db, 'guilds', 'leader-a')));
  await assertSucceeds(deleteDoc(doc(leader('leader-a'), 'memberTokens', hashA)));
  await assertFails(getDoc(doc(db, 'guilds', 'leader-a')));
  await assertFails(getDocs(collection(db, 'guilds', 'leader-a', 'members')));
  await assertFails(updateDoc(doc(db, 'guilds', 'leader-a'), { teams: {}, updatedAt: serverTimestamp() }));
  await assertFails(setDoc(doc(db, 'guilds', 'leader-a', 'members', 'new'), { ign: 'After revocation' }));
  await assertFails(setDoc(doc(member('new-viewer'), 'memberSessions', 'new-viewer'), session()));
});
test('expired tokens deny new sessions and existing-session reads', async () => {
  const db = member('viewer');
  await assertSucceeds(setDoc(doc(db, 'memberSessions', 'viewer'), session()));
  await env.withSecurityRulesDisabled(context => updateDoc(doc(context.firestore(), 'memberTokens', hashA), { expiresAt: Timestamp.fromMillis(Date.now() - 60000) }));
  await assertFails(getDoc(doc(db, 'guilds', 'leader-a')));
  await assertFails(updateDoc(doc(db, 'guilds', 'leader-a'), { teams: {}, updatedAt: serverTimestamp() }));
  await assertFails(deleteDoc(doc(db, 'guilds', 'leader-a', 'members', 'player')));
  await assertFails(setDoc(doc(member('new-viewer'), 'memberSessions', 'new-viewer'), session()));
});
test('tokens cannot be extended, recreated over existing tokens, or revoked by another leader', async () => {
  await assertFails(updateDoc(doc(leader('leader-a'), 'memberTokens', hashA), { expiresAt: Timestamp.fromMillis(Date.now() + 200000000) }));
  await assertFails(setDoc(doc(leader('leader-a'), 'memberTokens', hashA), token()));
  await assertFails(deleteDoc(doc(leader('leader-b'), 'memberTokens', hashA)));
  await assertFails(setDoc(doc(leader('leader-a'), 'memberTokens', 'e'.repeat(64)), { ...token(), expiresAt: Timestamp.fromMillis(Date.now() + 40 * 86400000) }));
});
test('anonymous and signed-out users cannot create leader profiles or guilds', async () => {
  for (const db of [member('new-leader'), env.unauthenticatedContext().firestore()]) {
    const batch = writeBatch(db);
    batch.set(doc(db, 'guilds', 'new-leader'), { name: 'Guild', ownerId: 'new-leader', createdAt: serverTimestamp(), teams: {} });
    batch.set(doc(db, 'users', 'new-leader'), { guildId: 'new-leader', displayName: 'Name', createdAt: serverTimestamp() });
    await assertFails(batch.commit());
  }
});
test('leader onboarding still works atomically and other leaders cannot read its guild', async () => {
  const db = leader('new-leader');
  const batch = writeBatch(db);
  batch.set(doc(db, 'guilds', 'new-leader'), { name: 'Guild', ownerId: 'new-leader', createdAt: serverTimestamp(), teams: {} });
  batch.set(doc(db, 'users', 'new-leader'), { guildId: 'new-leader', displayName: 'Name', createdAt: serverTimestamp() });
  await assertSucceeds(batch.commit());
  await assertSucceeds(getDoc(doc(db, 'guilds', 'new-leader')));
  await assertFails(getDoc(doc(leader('leader-b'), 'guilds', 'new-leader')));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'memberTokens', hashA)));
});

test('CSV roster replacement works for leaders and token sessions, retaining player IDs', async () => {
  const contexts = [leader('leader-a'), member('viewer')];
  await assertSucceeds(setDoc(doc(contexts[1], 'memberSessions', 'viewer'), session()));
  for (const db of contexts) {
    const result = await replaceGuildRoster(db, 'leader-a', [{ ign: ' Player ', className: 'Knight', gearScore: 1500 }, { ign: 'Healer', className: 'Priest', gearScore: 1000 }, { ign: 'PLAYER', className: 'Knight', gearScore: 1 }]);
    if (result.added !== 2 || result.duplicates !== 1) throw new Error('Incorrect import result');
    const preserved = await getDoc(doc(db, 'guilds', 'leader-a', 'members', 'player'));
    if (!preserved.exists() || preserved.data().gearScore !== 1500) throw new Error('Existing member ID was lost');
    if ((await getDocs(collection(db, 'guilds', 'leader-a', 'members'))).size !== 2) throw new Error('Incorrect roster size');
    const guild = await getDoc(doc(db, 'guilds', 'leader-a'));
    if (!guild.data().boardEditId || guild.data().teams.groups.length !== 0) throw new Error('Board reset was not committed');
  }
});

test('outdated board rules reject the import atomically with an actionable error', async () => {
  const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8').replace("['teams', 'boardEditId', 'updatedAt']", "['teams', 'updatedAt']");
  const oldEnv = await initializeTestEnvironment({ projectId: 'demo-ronw-old-rules', firestore: { host: '127.0.0.1', port: 8080, rules } });
  try {
    await oldEnv.clearFirestore();
    await oldEnv.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await setDoc(doc(db, 'guilds', 'leader-a'), { ownerId: 'leader-a', name: 'Guild', teams: { top: [{ slots: ['old-player'] }] } });
      await setDoc(doc(db, 'guilds', 'leader-a', 'members', 'old-player'), { ign: 'Original', gearScore: 123 });
    });
    const db = oldEnv.authenticatedContext('leader-a', { firebase: { sign_in_provider: 'password' } }).firestore();
    let denied = false;
    try { await replaceGuildRoster(db, 'leader-a', [{ ign: 'New', className: 'Knight', gearScore: 999 }]); }
    catch (error) { denied = error.code === 'permission-denied' && describeImportError(error).includes('Publish the latest firestore.rules'); }
    if (!denied) throw new Error('Expected outdated rules to reject the new revision field');
    const original = await getDoc(doc(db, 'guilds', 'leader-a', 'members', 'old-player'));
    const guild = await getDoc(doc(db, 'guilds', 'leader-a'));
    if (!original.exists() || (await getDocs(collection(db, 'guilds', 'leader-a', 'members'))).size !== 1 || guild.data().teams.top[0].slots[0] !== 'old-player') throw new Error('Denied import changed existing data');
  } finally { await oldEnv.cleanup(); }
});

test('workspace settings are owner-only and view-only blocks shared writes', async () => {
  const owner = leader('leader-a'); const viewer = member('viewer');
  await assertSucceeds(setDoc(doc(viewer, 'memberSessions', 'viewer'), session()));
  await assertSucceeds(updateDoc(doc(owner, 'guilds', 'leader-a'), { name: 'Personal roster', sharedReadOnly: true, updatedAt: serverTimestamp() }));
  await assertSucceeds(getDocs(collection(viewer, 'guilds', 'leader-a', 'members')));
  await assertFails(updateDoc(doc(viewer, 'guilds', 'leader-a'), { teams: {}, updatedAt: serverTimestamp() }));
  await assertFails(setDoc(doc(viewer, 'guilds', 'leader-a', 'members', 'new'), { ign: 'Denied' }));
  await assertFails(deleteDoc(doc(viewer, 'guilds', 'leader-a', 'savedTeams', 'formation')));
  await assertFails(updateDoc(doc(viewer, 'guilds', 'leader-a'), { sharedReadOnly: false, updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(leader('leader-b'), 'guilds', 'leader-a'), { name: 'Denied', updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(owner, 'guilds', 'leader-a'), { name: '', updatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(doc(owner, 'guilds', 'leader-a'), { sharedReadOnly: false, updatedAt: serverTimestamp() }));
  await assertSucceeds(setDoc(doc(viewer, 'guilds', 'leader-a', 'members', 'new'), { ign: 'Allowed' }));
});

test('profile display name changes cannot reassign membership', async () => {
  await env.withSecurityRulesDisabled(async context => setDoc(doc(context.firestore(), 'users', 'leader-a'), { guildId: 'leader-a', displayName: 'Player', createdAt: Timestamp.now() }));
  const owner = leader('leader-a');
  await assertSucceeds(updateDoc(doc(owner, 'users', 'leader-a'), { displayName: 'New name' }));
  await assertFails(updateDoc(doc(owner, 'users', 'leader-a'), { guildId: 'leader-b' }));
  await assertFails(updateDoc(doc(leader('leader-b'), 'users', 'leader-a'), { displayName: 'Denied' }));
});

test('deletion in progress blocks edits and new access tokens', async () => {
  await env.withSecurityRulesDisabled(async context => updateDoc(doc(context.firestore(), 'guilds', 'leader-a'), { deletionPending: true }));
  const owner = leader('leader-a');
  await assertFails(updateDoc(doc(owner, 'guilds', 'leader-a'), { teams: {}, updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(owner, 'guilds', 'leader-a'), { name: 'Changed', updatedAt: serverTimestamp() }));
  await assertFails(setDoc(doc(owner, 'memberTokens', 'c'.repeat(64)), token()));
  await assertFails(setDoc(doc(owner, 'guilds', 'leader-a', 'members', 'new'), { ign: 'New' }));
});

test('permissions apply per token and only owners can change them', async () => {
  const owner = leader('leader-a'); const viewer = member('viewer'); const editor = member('editor'); const editHash = 'c'.repeat(64);
  await assertSucceeds(updateDoc(doc(owner, 'memberTokens', hashA), { permission: 'view' }));
  await assertSucceeds(setDoc(doc(owner, 'memberTokens', editHash), { ...token(), permission: 'edit' }));
  await assertSucceeds(setDoc(doc(viewer, 'memberSessions', 'viewer'), session()));
  await assertSucceeds(setDoc(doc(editor, 'memberSessions', 'editor'), session('leader-a', editHash)));
  await assertSucceeds(getDocs(collection(viewer, 'guilds', 'leader-a', 'members')));
  await assertFails(updateDoc(doc(viewer, 'guilds', 'leader-a'), { teams: {}, updatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(doc(editor, 'guilds', 'leader-a'), { teams: {}, updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(viewer, 'memberTokens', hashA), { permission: 'edit' }));
  await assertFails(updateDoc(doc(leader('leader-b'), 'memberTokens', hashA), { permission: 'edit' }));
  await assertFails(updateDoc(doc(owner, 'memberTokens', hashA), { permission: 'admin' }));
  await assertFails(updateDoc(doc(owner, 'memberTokens', hashA), { permission: 'edit', guildId: 'leader-b' }));
  await assertSucceeds(updateDoc(doc(owner, 'memberTokens', hashA), { permission: 'edit' }));
  await assertSucceeds(updateDoc(doc(viewer, 'guilds', 'leader-a'), { teams: {}, updatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(doc(owner, 'memberTokens', editHash), { permission: 'view' }));
  await assertFails(deleteDoc(doc(editor, 'guilds', 'leader-a', 'members', 'player')));
});
