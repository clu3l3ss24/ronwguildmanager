export default function Navbar({ page, setPage, role, setRole, memberCount, user, onLogin, onLogout, firebaseEnabled }) {
  return <header className="navbar"><div className="brand"><span className="brand-mark">R</span><div>ROW <b>GUILD MANAGER</b></div></div>
    <nav>{[['dashboard', 'Command'], ['members', 'Members'], ['teams', 'Team Builder']].map(([id, name]) => <button key={id} className={page === id ? 'active' : ''} onClick={() => setPage(id)}>{name}</button>)}</nav>
    <div className="nav-end"><span className="roster-count">{memberCount} rostered</span><select value={role} onChange={e => setRole(e.target.value)} aria-label="Current user role"><option>Guild Master</option><option>Officer</option><option>Member</option></select>{firebaseEnabled && (user ? <button className="user-button" onClick={onLogout}>{user.displayName || 'Sign out'}</button> : <button className="user-button" onClick={onLogin}>Sign in</button>)}</div>
  </header>;
}
