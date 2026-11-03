import { useEffect, useState } from 'react';
import { createUserWithEmailAndPassword, onAuthStateChanged, sendPasswordResetEmail, signInAnonymously, signInWithEmailAndPassword, signOut, updateProfile } from 'firebase/auth';
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { auth, db, firebaseEnabled } from '../firebase/config';
import { blankTeams } from '../firebase/teams';
import { hashMemberToken } from '../firebase/memberTokens';
import '../account.css';
import '../tokens.css';

const messages = {
  'auth/email-already-in-use': 'This email already has an account. Sign in instead.',
  'auth/invalid-credential': 'Email or password is incorrect.',
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/weak-password': 'Choose a stronger password with at least 8 characters.',
  'auth/too-many-requests': 'Too many attempts. Please try again later.',
  'auth/network-request-failed': 'Could not connect. Check your internet connection.',
  'auth/operation-not-allowed': 'This sign-in method has not been enabled in Firebase.',
  'auth/unauthorized-domain': 'This website domain must be authorized in Firebase Authentication.',
  'permission-denied': 'Access was denied. Check that the supplied Firestore rules are deployed.',
  'member/invalid-token': 'This member token is invalid, expired, or revoked. Ask your guild leader for a new one.',
};
const describeError = error => messages[error.code] || 'Something went wrong. Please try again.';

export default function AccountGate({ children }) {
  const [user, setUser] = useState(null);
  const [guild, setGuild] = useState(null);
  const [loading, setLoading] = useState(firebaseEnabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [mode, setMode] = useState('signin');
  const [demo, setDemo] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!firebaseEnabled) return;
    return onAuthStateChanged(auth, next => {
      setUser(next); setGuild(null); setError(''); setLoading(Boolean(next));
      if (!next) { setMode('signin'); setNotice(''); setDemo(false); }
      else if (next.isAnonymous) setMode('member');
    });
  }, []);
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    let generation = 0;
    let unsubscribeToken;
    let expiryTimer;
    if (user.isAnonymous) {
      setLoading(true); setError('');
      const invalidate = () => {
        generation += 1; clearInterval(expiryTimer);
        if (!cancelled) { setGuild(null); setLoading(false); setError(messages['member/invalid-token']); }
      };
      const unsubscribeSession = onSnapshot(doc(db, 'memberSessions', user.uid), session => {
        generation += 1;
        unsubscribeToken?.(); clearInterval(expiryTimer);
        if (!session.exists()) { setGuild(null); setLoading(false); return; }
        const { guildId, tokenHash } = session.data();
        setGuild(null); setLoading(true);
        unsubscribeToken = onSnapshot(doc(db, 'memberTokens', tokenHash), async token => {
          const version = ++generation;
          clearInterval(expiryTimer);
          if (!token.exists() || token.data().guildId !== guildId || token.data().expiresAt.toMillis() <= Date.now()) return invalidate();
          expiryTimer = setInterval(() => { if (token.data().expiresAt.toMillis() <= Date.now()) invalidate(); }, 1000);
          try {
            const saved = await getDoc(doc(db, 'guilds', guildId));
            if (cancelled || version !== generation) return;
            if (!saved.exists()) return invalidate();
            if (!cancelled && version === generation && token.data().expiresAt.toMillis() > Date.now()) { setGuild({ ...saved.data(), id: saved.id, tokenExpiresAt: token.data().expiresAt.toMillis() }); setLoading(false); setError(''); }
          } catch { if (!cancelled && version === generation) invalidate(); }
        }, invalidate);
      }, invalidate);
      return () => { cancelled = true; unsubscribeSession(); unsubscribeToken?.(); clearInterval(expiryTimer); };
    }
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const profile = await getDoc(doc(db, 'users', user.uid));
        if (!profile.exists()) return;
        const saved = await getDoc(doc(db, 'guilds', profile.data().guildId));
        if (!saved.exists()) throw new Error('Missing guild');
        if (!cancelled) setGuild({ ...saved.data(), id: saved.id });
      } catch (failure) { if (!cancelled) setError(describeError(failure)); }
      finally { if (!cancelled) setLoading(false); }
    };
    load();
    return () => { cancelled = true; };
  }, [user, retry]);

  const run = async action => {
    setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (failure) { setError(describeError(failure)); }
    finally { setBusy(false); }
  };
  const submit = event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = String(data.get('email') || '').trim();
    const password = String(data.get('password') || '');
    if (mode === 'signup' && password !== data.get('confirm')) return setError('Passwords do not match.');
    run(async () => {
      if (mode === 'member') {
        let tokenHash;
        try { tokenHash = await hashMemberToken(data.get('memberToken')); }
        catch { throw Object.assign(new Error(), { code: 'member/invalid-token' }); }
        const member = auth.currentUser?.isAnonymous ? auth.currentUser : (await signInAnonymously(auth)).user;
        const token = await getDoc(doc(db, 'memberTokens', tokenHash));
        if (!token.exists() || token.data().expiresAt.toMillis() <= Date.now()) throw Object.assign(new Error(), { code: 'member/invalid-token' });
        await setDoc(doc(db, 'memberSessions', member.uid), { guildId: token.data().guildId, tokenHash, joinedAt: serverTimestamp() });
      } else if (mode === 'reset') {
        await sendPasswordResetEmail(auth, email);
        setNotice('If an account exists for this email, a password reset link will be sent.');
      } else if (mode === 'signup') {
        const result = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(result.user, { displayName: String(data.get('displayName')).trim() });
      } else await signInWithEmailAndPassword(auth, email, password);
    });
  };
  const createGuild = event => {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get('guildName') || '').trim();
    if (!name) return setError('Enter your guild name.');
    run(async () => {
      // Deterministic ID makes a retried onboarding safe and limits this phase to one guild per leader.
      const guildRef = doc(db, 'guilds', user.uid);
      const batch = writeBatch(db);
      batch.set(guildRef, { name, ownerId: user.uid, createdAt: serverTimestamp(), teams: blankTeams() });
      batch.set(doc(db, 'users', user.uid), { guildId: user.uid, displayName: user.displayName || '', createdAt: serverTimestamp() });
      await batch.commit();
      setGuild({ id: user.uid, name, ownerId: user.uid });
    });
  };
  const changeMode = next => { setMode(next); setError(''); setNotice(''); };
  if (demo) return children({ user: null, guild: null, exitDemo: () => { setDemo(false); setMode('signin'); setError(''); setNotice(''); } });
  if (user && guild && !loading) return children({ user, guild, role: 'Guild Master' });

  return <main className="account-page"><section className="account-intro"><span className="brand-mark">R</span><p className="eyebrow">RONW GUILD MANAGER</p><h1>Your guild.<br /><em>Your command center.</em></h1><p>Keep your roster, parties, and battle plans together in a private guild workspace.</p><ul><li>A separate workspace for every guild</li><li>Your roster and formations, available across devices</li><li>One account to lead your guild</li></ul></section><section className="account-panel" aria-busy={loading || busy}>
    {loading ? <><h2>Opening your workspace…</h2><p role="status">Checking your account and guild.</p></> : user && !user.isAnonymous ? <>
      <p className="eyebrow">WELCOME, GUILD LEADER</p><h2>Create your guild</h2><p>Signed in as {user.email}. Name your private workspace to get started.</p>
      {error ? <><p className="account-error" role="alert">{error}</p><button onClick={() => setRetry(value => value + 1)} disabled={busy}>Retry loading account</button></> : null}
      {!error && <form onSubmit={createGuild}><label>Guild name<input name="guildName" required maxLength={80} autoComplete="organization" disabled={busy} /></label><button className="primary-button" disabled={busy}>{busy ? 'Creating guild…' : 'Create guild workspace'}</button></form>}<button className="account-link" disabled={busy} onClick={() => run(() => signOut(auth))}>Sign out</button>
    </> : <>
      <p className="eyebrow">{mode === 'member' ? 'GUILD MEMBER ACCESS' : 'GUILD LEADER ACCESS'}</p><h2>{mode === 'signup' ? 'Create your account' : mode === 'signin' ? 'Welcome back' : mode === 'member' ? 'Member token login' : 'Reset your password'}</h2><p>{mode === 'signup' ? 'Start with your account, then create your guild.' : mode === 'signin' ? 'Sign in to open your guild workspace.' : mode === 'member' ? 'Enter the token shared by your guild leader to view your guild.' : 'Enter your account email to request a reset link.'}</p>
      {(mode === 'signin' || mode === 'member') && <div className="account-access" aria-label="Sign-in method"><button aria-pressed={mode === 'signin'} disabled={busy} onClick={() => changeMode('signin')}>Account login</button><button aria-pressed={mode === 'member'} disabled={busy} onClick={() => changeMode('member')}>Member token</button></div>}
      {!firebaseEnabled && <p className="account-notice" role="status">Online accounts are not configured yet. Set up Firebase to enable sign-up, or explore the local demo below.</p>}
      <form onSubmit={submit} key={mode}><fieldset disabled={busy || !firebaseEnabled}>
        {mode === 'signup' && <label>Your name<input name="displayName" required maxLength={80} autoComplete="name" /></label>}
        {mode === 'member' ? <label>Member token<input name="memberToken" required autoComplete="off" spellCheck={false} placeholder="RONW-…" /><small>Full guild management access until the token expires or is revoked.</small></label> : <label>Email<input name="email" type="email" required autoComplete="email" /></label>}
        {(mode === 'signin' || mode === 'signup') && <label>Password<input name="password" type="password" required minLength={mode === 'signup' ? 8 : undefined} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />{mode === 'signup' && <small>Use at least 8 characters.</small>}</label>}
        {mode === 'signup' && <label>Confirm password<input name="confirm" type="password" required minLength={8} autoComplete="new-password" /></label>}
        <button className="primary-button" type="submit">{busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : mode === 'signin' ? 'Sign in' : mode === 'member' ? 'Open guild with token' : 'Send reset link'}</button>
      </fieldset></form>
      {error && <p className="account-error" role="alert">{error}</p>}{notice && <p className="account-notice" role="status">{notice}</p>}
      <div className="account-links"><button className="account-link" disabled={busy} onClick={() => changeMode(mode === 'signin' ? 'signup' : 'signin')}>{mode === 'signin' ? 'New here? Sign up' : 'Back to account login'}</button>{mode === 'signin' && <button className="account-link" disabled={busy} onClick={() => changeMode('reset')}>Forgot password?</button>}{user?.isAnonymous && <button className="account-link" disabled={busy} onClick={() => run(() => signOut(auth))}>End member session</button>}</div>
      {!firebaseEnabled && <button className="account-secondary" onClick={() => setDemo(true)}>Explore local demo</button>}
    </>}
  </section></main>;
}
