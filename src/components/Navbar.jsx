export default function Navbar({ page, setPage, role, memberCount, user, guild, onLogout }) {
  return <><header className="navbar"><div className="brand"><span className="brand-mark">R</span><div>RONW <b>ROSTER PLANNER</b></div></div>
    <nav>{[['dashboard', 'Overview'], ['members', 'Roster'], ['teams', 'Team Builder'], ['settings', 'Settings']].map(([id, name]) => <button key={id} className={page === id ? 'active' : ''} onClick={() => setPage(id)}>{name}</button>)}</nav>
    <div className="nav-end"><span className="roster-count">{memberCount} rostered</span><span className="account-identity" title={user?.email}>{guild?.name || 'Local demo'} · {role}</span><button className="user-button" onClick={onLogout}>{user ? 'Sign out' : 'Exit demo'}</button></div>
  </header><div className="mobile-account"><span>{guild?.name || 'Local demo'} · {role}</span><button className="user-button" onClick={onLogout}>{user ? 'Sign out' : 'Exit demo'}</button></div></>;
}
