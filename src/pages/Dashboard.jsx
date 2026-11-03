import CSVUploader from '../components/CSVUploader';
import MemberTokenPanel from '../components/MemberTokenPanel';
export default function Dashboard({ canManageTokens, members, onImport, role, teams, guildName = 'Local demo', guildId, ownerId, tokenExpiresAt }) {
  const online = members.filter(member => member.online).length; const assigned = new Set(Object.values(teams).flat(2).filter(Boolean)).size;
  return <main className="page"><div className="page-title"><p className="eyebrow">{guildName} · COMMAND CENTER</p><h1>Guild operations, <em>organized.</em></h1><p>Keep your roster battle-ready and your squads balanced for every war.</p></div>
    <div className="metric-grid"><Metric label="Guild Members" value={members.length} note="Current roster" /><Metric label="Online Now" value={online} note="Ready for battle" accent="green" /><Metric label="Team Assigned" value={assigned} note="Across your teams" accent="purple" /><Metric label="Unassigned" value={members.length - assigned} note="Awaiting placement" accent="orange" /></div>
    <CSVUploader onImport={onImport} canUpload={role === 'Guild Master'} />
    {canManageTokens && role === 'Guild Master' && <MemberTokenPanel guildId={guildId} ownerId={ownerId} tokenExpiresAt={tokenExpiresAt} />}
  </main>;
}
function Metric({ label, value, note, accent = '' }) { return <section className={`metric ${accent}`}><small>{label}</small><strong>{value}</strong><span>{note}</span></section>; }
