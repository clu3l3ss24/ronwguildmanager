import CSVUploader from '../components/CSVUploader';
export default function Dashboard({ members, onImport, role, teams }) {
  const online = members.filter(member => member.online).length; const assigned = new Set(Object.values(teams).flat(2).filter(Boolean)).size;
  return <main className="page"><div className="page-title"><p className="eyebrow">RETALIATION PH · COMMAND CENTER</p><h1>Guild operations, <em>organized.</em></h1><p>Keep your roster battle-ready and your squads balanced for every war.</p></div>
    <div className="metric-grid"><Metric label="Guild Members" value={members.length} note="Current roster" /><Metric label="Online Now" value={online} note="Ready for battle" accent="green" /><Metric label="Team Assigned" value={assigned} note="Across four lanes" accent="purple" /><Metric label="Unassigned" value={members.length - assigned} note="Awaiting placement" accent="orange" /></div>
    <CSVUploader onImport={onImport} canUpload={role === 'Guild Master'} />
  </main>;
}
function Metric({ label, value, note, accent = '' }) { return <section className={`metric ${accent}`}><small>{label}</small><strong>{value}</strong><span>{note}</span></section>; }
