import JobIcon from './JobIcon';
import { roleForClass } from '../utils/classRoles';
export { roleForClass } from '../utils/classRoles';

const classKey = (value = '') => {
  const name = value.toLowerCase();
  if (roleForClass(value) === 'Tank') return 'knight';
  if (roleForClass(value) === 'Healer') return 'priest';
  if (name.includes('wizard') || name.includes('mage')) return 'wizard';
  if (name.includes('hunter') || name.includes('archer')) return 'hunter';
  if (name.includes('assassin') || name.includes('rogue')) return 'assassin';
  return 'other';
};

export default function MemberCard({ member, compact = false, onDelete }) {
  return <article className={`member-card class-${classKey(member.className)} ${compact ? 'compact' : ''}`}>
    <div className="member-top"><span className="status-dot" data-online={member.online} role="img" aria-label={member.online ? 'Online' : 'Offline'} title={member.online ? 'Online' : 'Offline'} /> <strong>{member.ign}</strong>{onDelete && <button className="icon-button" onClick={() => onDelete(member.id)} aria-label={`Delete ${member.ign}`}>×</button>}</div>
    <span className="class-tag"><JobIcon className={member.className} /><span>{member.className || 'Unknown'} · {roleForClass(member.className)}</span></span>
    {compact ? <div className="compact-details"><span>{Number(member.gearScore || 0).toLocaleString()} GS</span></div> : <><div className="member-stats"><span>LV. {member.level || '—'}</span><span>{Number(member.gearScore || 0).toLocaleString()} GS</span></div></>}
  </article>;
}
