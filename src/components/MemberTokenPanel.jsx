import { useEffect, useState } from 'react';
import { collection, doc, getDoc, onSnapshot, query, serverTimestamp, Timestamp, updateDoc, where, writeBatch } from 'firebase/firestore';
import { auth, db, firebaseEnabled } from '../firebase/config';
import { createMemberToken, hashMemberToken } from '../firebase/memberTokens';

export default function MemberTokenPanel({ guildId, ownerId, tokenExpiresAt, sharedReadOnly = false }) {
  const [tokens, setTokens] = useState([]);
  const [rawToken, setRawToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!firebaseEnabled || !guildId || auth.currentUser?.isAnonymous) return;
    return onSnapshot(query(collection(db, 'memberTokens'), where('guildId', '==', guildId)), snap => {
      setTokens(snap.docs.map(item => ({ ...item.data(), id: item.id })).filter(item => item.guildId === guildId).sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0)));
      setLoaded(true); setError('');
    }, () => { setError('Could not load access tokens. Publish the updated Firestore rules, check your connection, then reload this page.'); setLoaded(false); });
  }, [guildId]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer); }, []);
  const changeAccess = async (token, permission) => {
    if (!auth.currentUser || auth.currentUser.isAnonymous) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await updateDoc(doc(db, 'memberTokens', token.id), { permission });
      setNotice('Permission updated to ' + permission + ' for "' + token.name + '".');
    } catch { setError('Could not change permission. Check your connection and publish the latest Firestore rules.'); }
    finally { setBusy(false); }
  };
  const create = async event => {
    event.preventDefault();
    if (!auth.currentUser || auth.currentUser.isAnonymous) return;
    const data = new FormData(event.currentTarget);
    const name = String(data.get('name') || '').trim();
    if (!name) return setError('Enter a label for this token.');
    setBusy(true); setError(''); setNotice(''); setRawToken('');
    try {
      const token = createMemberToken();
      const hash = await hashMemberToken(token);
      const days = Number(data.get('days'));
      const expiresAt = Math.min(Date.now() + days * 86400000, tokenExpiresAt ?? Infinity);
      const batch = writeBatch(db);
      batch.set(doc(db, 'memberTokens', hash), { guildId, ownerId, name, permission: sharedReadOnly ? 'view' : 'edit', createdAt: serverTimestamp(), expiresAt: Timestamp.fromMillis(expiresAt) });
      batch.set(doc(db, 'guilds', guildId, 'tokenSecrets', hash), { token });
      await batch.commit();
      setRawToken(token);
      setNotice('Token created. You can copy it again from the list below.');
    } catch { setError('Could not create the token. Check your connection and publish the updated Firestore rules.'); }
    finally { setBusy(false); }
  };
  const revoke = async token => {
    if (!auth.currentUser || auth.currentUser.isAnonymous) return;
    if (!window.confirm(`Revoke "${token.name}"? Members using this token will lose access.`)) return;
    setBusy(true); setError(''); setNotice('');
    try { const batch = writeBatch(db); batch.delete(doc(db, 'memberTokens', token.id)); batch.delete(doc(db, 'guilds', guildId, 'tokenSecrets', token.id)); await batch.commit(); setRawToken(''); setNotice('Token revoked. Members using it can no longer access your workspace.'); }
    catch { setError('Could not revoke the token. Please try again.'); }
    finally { setBusy(false); }
  };
  const copy = async (value = rawToken) => {
    try { await navigator.clipboard.writeText(value); setNotice('Token copied. Share it privately with collaborators.'); }
    catch { setNotice('Select and copy the token from the field below.'); }
  };
  const copySaved = async token => {
    if (!auth.currentUser || auth.currentUser.isAnonymous) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const secret = await getDoc(doc(db, 'guilds', guildId, 'tokenSecrets', token.id));
      if (!secret.exists()) { setNotice('This older token was stored as a hash and cannot be recovered. Create a replacement token and revoke this one.'); return; }
      const value = secret.data().token;
      if (await hashMemberToken(value) !== token.id) throw new Error('Token mismatch');
      setRawToken(value);
      await copy(value);
    } catch { setError('Could not retrieve this token. Check your connection and publish the latest Firestore rules.'); }
    finally { setBusy(false); }
  };
  return <section className="token-panel"><p className="eyebrow">SHARED ACCESS</p><h2>Shared access tokens</h2><p>Choose Edit or View beside each token to control its access. Only the workspace owner can view, copy, create, or revoke login tokens. Revoke one at any time to end access.</p>
    {!firebaseEnabled ? <p className="permission-note">Access tokens require a configured Firebase project.</p> : <>
      <form className="token-create" onSubmit={create}><label>Token label<input name="name" required maxLength={60} placeholder="e.g. Friends or teammates" disabled={busy || !loaded} /></label><label>Expires after<select name="days" defaultValue="7" disabled={busy || !loaded}><option value="1">1 day</option><option value="7">7 days</option><option value="30">30 days</option></select></label><button className="primary-button" disabled={busy || !loaded}>{busy ? 'Please wait…' : 'Create access token'}</button></form>
      {tokenExpiresAt && <p>Tokens you create cannot outlive your current token, which expires {new Date(tokenExpiresAt).toLocaleString()}.</p>}
      {error && <p className="account-error" role="alert">{error}</p>}{notice && <p className="token-notice" role="status">{notice}</p>}
      {rawToken && <div className="token-secret"><label>Access token<input readOnly value={rawToken} onFocus={event => event.target.select()} spellCheck={false} /></label><button className="user-button" onClick={() => copy()}>Copy token</button><small>Anyone with this token can access your workspace with its assigned permission until it expires or is revoked.</small></div>}
      {!loaded && !error && <p role="status">Loading access tokens…</p>}
      {loaded && !tokens.length && <p className="token-empty">No access tokens yet.</p>}
      <ul className="token-list">{tokens.map(token => <li key={token.id}><div><strong>{token.name}</strong><small>{token.expiresAt?.toMillis() > now ? 'Expires' : 'Expired'} {token.expiresAt?.toDate().toLocaleString()}</small></div><div className="token-row-actions"><button className="user-button" disabled={busy || token.expiresAt?.toMillis() <= now} onClick={() => copySaved(token)} aria-label={`Copy token ${token.name}`}>Copy token</button><button className="clear-button" disabled={busy} onClick={() => revoke(token)}>Revoke</button><select className="token-permission" aria-label={`Permission for ${token.name}`} value={token.permission || (sharedReadOnly ? 'view' : 'edit')} disabled={busy || token.expiresAt?.toMillis() <= now} onChange={event => changeAccess(token, event.target.value)}><option value="edit">Edit</option><option value="view">View</option></select></div></li>)}</ul>
    </>}
  </section>;
}
