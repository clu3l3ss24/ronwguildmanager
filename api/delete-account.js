import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) return res.status(503).json({ error: 'Account deletion is not configured yet. Contact the app administrator.' });
  try {
    if (!getApps().length) initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)) });
    const auth = getAuth();
    let identity;
    try { identity = await auth.verifyIdToken((req.headers.authorization || '').replace(/^Bearer /, ''), true); }
    catch { return res.status(401).json({ error: 'Sign in again before deleting your account.' }); }
    if (identity.firebase?.sign_in_provider !== 'password' || Date.now() / 1000 - identity.auth_time > 300) return res.status(403).json({ error: 'Confirm your current password again.' });
    const db = getFirestore(); const uid = identity.uid;
    const workspace = db.doc(`guilds/${uid}`);
    const saved = await workspace.get();
    if (saved.exists && saved.data().ownerId !== uid) return res.status(403).json({ error: 'Workspace ownership could not be verified.' });
    await db.doc('users/' + uid).set({ deletionPending: true }, { merge: true });
    if (saved.exists) await workspace.update({ deletionPending: true });
    // Revoke shared access first. All paths are derived from the verified UID.
    for (const collection of ['memberTokens', 'memberSessions']) {
      let page;
      do {
        page = await db.collection(collection).where('guildId', '==', uid).limit(400).get();
        if (!page.empty) { const batch = db.batch(); page.docs.forEach(item => batch.delete(item.ref)); await batch.commit(); }
      } while (!page.empty);
    }
    await db.recursiveDelete(workspace);
    // Delete Auth before the profile: if this fails, the retained profile prevents accidental re-onboarding.
    await auth.deleteUser(uid);
    await db.doc(`users/${uid}`).delete();
    return res.status(200).json({ deleted: true });
  } catch (error) {
    console.error('Account deletion failed', error.code || 'internal');
    return res.status(500).json({ error: 'Deletion did not finish. Some data may already be removed. Retry to finish deleting your account.' });
  }
}
