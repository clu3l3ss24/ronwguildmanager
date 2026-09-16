const classKey = (value = '') => {
  const name = value.toLowerCase();
  if (name.includes('knight') || name.includes('tank')) return 'knight';
  if (name.includes('priest') || name.includes('healer') || name.includes('support')) return 'priest';
  if (name.includes('wizard') || name.includes('mage')) return 'wizard';
  if (name.includes('hunter') || name.includes('archer')) return 'hunter';
  if (name.includes('assassin') || name.includes('rogue')) return 'assassin';
  return 'other';
};

export const roleForClass = (className = '') => {
  const key = classKey(className);
  if (key === 'knight') return 'Tank';
  if (key === 'priest') return 'Healer';
  return 'DPS';
};

export default function MemberCard({ member, compact = false, onDelete }) {
  return <article className={`member-card class-${classKey(member.className)} ${compact ? 'compact' : ''}`}>
    <div className="member-top"><span className="status-dot" data-online={member.online} /> <strong>{member.ign}</strong>{onDelete && <button className="icon-button" onClick={() => onDelete(member.id)} aria-label={`Delete ${member.ign}`}>×</button>}</div>
    <span className="class-tag">{member.className || 'Unknown'} · {roleForClass(member.className)}</span>
    {compact ? <div className="compact-details"><span>{Number(member.gearScore || 0).toLocaleString()} GS</span><small>{member.online ? 'Online' : 'Offline'}</small></div> : <><div className="member-stats"><span>LV. {member.level || '—'}</span><span>{Number(member.gearScore || 0).toLocaleString()} GS</span></div><small>{member.online ? 'Online' : 'Offline'}</small></>}
  </article>;
}
