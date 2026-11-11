import { useState } from 'react';
import { EmailAuthProvider, reauthenticateWithCredential, sendEmailVerification, updatePassword, updateProfile, signOut } from 'firebase/auth';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import '../settings.css';

export default function Settings({ user, guild, members, board, savedTeams, onWorkspaceChange, onLogout, theme, setTheme, startPage, setStartPage }) {
  const owner = Boolean(user && !user.isAnonymous);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const run = async action => {
    setBusy(true); setMessage(''); setError('');
    try { await action(); } catch (e) { setError(e.code === 'auth/invalid-credential' ? 'Current password is incorrect.' : e.message || 'Could not save. Please try again.'); }
    finally { setBusy(false); }
  };
  const profile = event => {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    const displayName = String(data.get('displayName')).trim(); const name = String(data.get('name')).trim() || 'My workspace';
    if (!displayName) return setError('Enter a display name.');
    run(async () => {
      await updateDoc(doc(db, 'guilds', guild.id), { name, updatedAt: serverTimestamp() });
      await updateDoc(doc(db, 'users', user.uid), { displayName });
      await updateProfile(user, { displayName });
      onWorkspaceChange({ ...guild, name }); setMessage('Profile and workspace saved.');
    });
  };
  const password = event => {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    if (data.get('next') !== data.get('confirm')) return setError('New passwords do not match.');
    run(async () => { await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, String(data.get('current')))); await updatePassword(user, String(data.get('next'))); form.reset(); setMessage('Password changed.'); });
  };
  const remove = event => {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    if (data.get('workspace') !== guild.name) return setError('Type the workspace name exactly to confirm.');
    run(async () => {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, String(data.get('password'))));
      const response = await fetch('/api/delete-account', { method: 'POST', headers: { Authorization: `Bearer ${await user.getIdToken(true)}`, 'Content-Type': 'application/json' } });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Account deletion is unavailable. Please try again later.');
      await signOut(auth);
    });
  };
  const exportData = () => {
    const { ownerId, tokenExpiresAt, ...workspace } = guild || {};
    const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), workspace, members, board, savedTeams }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'ronw-workspace.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <main className="page settings-page"><div className="page-title"><p className="eyebrow">YOUR WORKSPACE</p><h1>Settings</h1><p>Manage your account, workspace, and preferences.</p></div>
    {error && <p className="account-error" role="alert">{error}</p>}{message && <p className="account-notice" role="status">{message}</p>}
    <fieldset disabled={busy} className="settings-fields">
    <section className="settings-card"><h2>{owner ? 'Account and workspace' : 'Session'}</h2>{owner ? <>
      <p>Signed in as <strong>{user.email}</strong></p><p>{user.emailVerified ? 'Email verified' : 'Email not yet verified'}</p>{!user.emailVerified && <button className="user-button" onClick={() => run(async () => { await sendEmailVerification(user); setMessage('Verification email sent. Check your inbox.'); })}>Send verification email</button>}
      <form onSubmit={profile}><label>Display name<input name="displayName" required maxLength={80} defaultValue={user.displayName || ''} autoComplete="name" /></label><label>Guild or workspace name (optional)<input name="name" maxLength={80} defaultValue={guild.name} placeholder="My workspace" /></label><button className="primary-button">Save changes</button></form>
    </> : <><p>{user ? 'You are using shared access. Account and workspace controls belong to the owner.' : 'Local demo: data stays in this browser.'}</p>{guild?.tokenExpiresAt && <p>Access expires {new Date(guild.tokenExpiresAt).toLocaleString()}.</p>}<button className="user-button" onClick={onLogout}>{user ? 'Leave workspace / Sign out' : 'Exit demo'}</button></>}</section>
    {owner && <section className="settings-card"><h2>Change password</h2><form onSubmit={password}><label>Current password<input name="current" type="password" required autoComplete="current-password" /></label><label>New password<input name="next" type="password" required minLength={8} autoComplete="new-password" /></label><label>Confirm new password<input name="confirm" type="password" required minLength={8} autoComplete="new-password" /></label><button className="primary-button">Change password</button></form></section>}
    <section className="settings-card"><h2>Appearance</h2><label>Theme<select value={theme} onChange={e => setTheme(e.target.value)}><option value="dark">Dark</option><option value="light">Light</option><option value="system">System</option></select></label><p className="settings-help">Remembered in this browser.</p></section>
    <section className="settings-card"><h2>Start page</h2><label>Open the app to<select value={startPage} onChange={e => setStartPage(e.target.value)}><option value="dashboard">Overview</option><option value="members">Roster</option><option value="teams">Team Builder</option></select></label><p className="settings-help">Remembered in this browser for your next visit.</p></section><section className="settings-card"><h2>Export workspace</h2><p>Download your roster, active board, and saved formations as JSON. Passwords and access tokens are excluded. This export is a reference backup; restoring JSON is not currently supported.</p><button className="user-button" onClick={exportData}>Download data</button></section>
    {owner && <section className="settings-card settings-danger"><h2>Danger zone</h2><p>Permanently delete your account, workspace, roster, saved formations, and access tokens. Shared sessions will lose access. This cannot be undone. Export your data first if you need a copy.</p><button className="clear-button" onClick={() => setDeleting(!deleting)}>{deleting ? 'Cancel deletion' : 'Delete account…'}</button>{deleting && <form onSubmit={remove}><label>Type “{guild.name}” to confirm<input name="workspace" required autoComplete="off" /></label><label>Current password<input name="password" type="password" required autoComplete="current-password" /></label><button className="clear-button">Permanently delete account</button></form>}</section>}
    </fieldset>
  </main>;
}
