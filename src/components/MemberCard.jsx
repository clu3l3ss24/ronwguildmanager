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

export default function MemberCard({ member, compact = false, onDelete, lowGear = false, longOffline = false }) {
  const warnings = [lowGear ? 'Gear score is at least 10% below roster average' : '', longOffline ? 'Offline for more than 3 days' : ''].filter(Boolean);
  const warningClass = `${lowGear ? ' member-card-low-gear' : ''}${longOffline ? ' member-card-long-offline' : ''}`;
  if (compact) return <article className={`member-card compact member-row class-${classKey(member.className)}${warningClass}`} title={[`${member.ign} ? ${member.className || 'Unknown'} ? ${Number(member.gearScore || 0).toLocaleString()} GS`, ...warnings].join(' · ')}>
    <span className="status-dot" data-online={member.online} role="img" aria-label={member.online ? 'Online' : 'Offline'} title={member.online ? 'Online' : 'Offline'} /><JobIcon className={member.className} /><strong className="member-row-name">{member.ign}</strong><span className="member-row-gs" aria-label={`Gear score ${Number(member.gearScore || 0).toLocaleString()}`}>{Number(member.gearScore || 0).toLocaleString()}</span>
  </article>;
  return <article className={`member-card class-${classKey(member.className)} ${compact ? 'compact' : ''}${warningClass}`}>
    <div className="member-top"><span className="status-dot" data-online={member.online} role="img" aria-label={member.online ? 'Online' : 'Offline'} title={member.online ? 'Online' : 'Offline'} /> <strong>{member.ign}</strong>{onDelete && <button className="icon-button" onClick={() => onDelete(member.id)} aria-label={`Delete ${member.ign}`}>×</button>}</div>
    <span className="class-tag"><JobIcon className={member.className} /><span>{member.className || 'Unknown'} · {roleForClass(member.className)}</span></span>
    {compact ? <div className="compact-details"><span>{Number(member.gearScore || 0).toLocaleString()} GS</span></div> : <><div className="member-stats"><span>LV. {member.level || '—'}</span><span>{Number(member.gearScore || 0).toLocaleString()} GS</span></div></>}
  </article>;
}
