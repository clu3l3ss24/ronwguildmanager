import { useMemo, useState } from 'react';
import '../roster-dashboard.css';

const number = value => {
  const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};
const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const whole = value => Math.round(value).toLocaleString();
const percent = (value, total) => total ? `${(value / total * 100).toFixed(1)}%` : '0.0%';
const fmt = value => whole(number(value));

function Icon({ type }) {
  const paths = {
    members: <><circle cx="9" cy="8" r="3"/><path d="M3 19c0-3 2.5-5 6-5s6 2 6 5M16 5a3 3 0 0 1 0 6m2 3c2 .6 3 2.2 3 4"/></>,
    level: <><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z"/></>,
    gear: <><path d="m5 4 14 16M19 4 5 20M8 4l2 2m6 12 2 2M16 4l-2 2M8 18l-2 2"/><path d="m5 4 4 1 1-2m9 1-4 1-1-2M5 20l4-1 1 2m9-1-4-1-1 2"/></>,
    weekly: <><ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v4c0 1.7 3.6 3 8 3s8-1.3 8-3V6m-16 4v4c0 1.7 3.6 3 8 3s8-1.3 8-3v-4m-16 4v4c0 1.7 3.6 3 8 3s8-1.3 8-3v-4"/></>,
    lifetime: <><path d="M4 16c-3-5 1-9 5-6l3 4 3-4c4-3 8 1 5 6l-4 5H8z"/><path d="M12 14v7M7 9l-2-3m12 3 2-3"/></>,
    crown: <><path d="m3 8 5 4 4-7 4 7 5-4-2 11H5zM5 22h14"/></>,
  };
  return <svg className="rd-icon" viewBox="0 0 24 24" aria-hidden="true">{paths[type]}</svg>;
}

function Metric({ icon, label, value, tone }) {
  return <section className="rd-metric"><span className={`rd-metric-icon ${tone}`}><Icon type={icon}/></span><div><small>{label}</small><strong>{value}</strong></div></section>;
}

function Breakdown({ title, icon, rows, countLabel, members, empty }) {
  return <section className="rd-panel rd-breakdown">
    <header className="rd-panel-heading"><h2><Icon type={icon}/>{title}</h2><span>{rows.length || 0} {countLabel} · {members} MEMBERS</span></header>
    {rows.length ? <div className="rd-table-wrap"><table><thead><tr><th>{title === 'Title Distribution' ? 'TITLE' : 'CLASS'}</th><th>COUNT</th><th>SHARE</th>{title !== 'Title Distribution' && <th>AVG GEAR</th>}</tr></thead><tbody>{rows.map(row => <tr key={row.name}><td><span className="rd-dot"/>{row.name}</td><td>{row.count}</td><td>{row.share}</td>{title !== 'Title Distribution' && <td>{row.gear}</td>}</tr>)}</tbody></table></div> : <p className="rd-empty">{empty}</p>}
  </section>;
}

function GearDistribution({ members }) {
  const values = members.map(member => number(member.gearScore)).filter(value => value > 0);
  if (!values.length) return <p className="rd-empty">Gear score data will appear after importing a CSV with a Gear Score column.</p>;
  const min = Math.floor(Math.min(...values) / 10000) * 10000;
  const max = Math.ceil(Math.max(...values) / 10000) * 10000 || min + 10000;
  const step = Math.max(1000, Math.ceil((max - min) / 7 / 1000) * 1000);
  const bins = Array.from({ length: Math.min(8, Math.max(1, Math.ceil((max - min + 1) / step))) }, (_, i) => ({ start: min + step * i, count: 0 }));
  values.forEach(value => { const index = Math.min(bins.length - 1, Math.floor((value - min) / step)); bins[index].count += 1; });
  const peak = Math.max(...bins.map(bin => bin.count), 1);
  const points = bins.map((bin, index) => `${30 + index * (340 / Math.max(bins.length - 1, 1))},${124 - bin.count / peak * 94}`).join(' ');
  const area = `30,124 ${points} 370,124`;
  return <div className="rd-chart"><svg viewBox="0 0 400 170" role="img" aria-label="Gear score distribution"><defs><linearGradient id="gearFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#b75cf5" stopOpacity=".72"/><stop offset="1" stopColor="#7728be" stopOpacity=".08"/></linearGradient></defs><path className="rd-gridline" d="M30 30H370M30 61H370M30 92H370M30 124H370"/><polygon points={area} fill="url(#gearFill)"/><polyline points={points} fill="none" stroke="#c478fa" strokeWidth="2.5" strokeLinejoin="round"/>{bins.map((bin, index) => <circle key={bin.start} cx={30 + index * (340 / Math.max(bins.length - 1, 1))} cy={124 - bin.count / peak * 94} r="3" fill="#f0d4ff"/>)}<text x="30" y="146">{whole(min / 1000)}K</text><text x="370" y="146" textAnchor="end">{whole((min + step * (bins.length - 1)) / 1000)}K</text></svg><div className="rd-chart-label">GEAR SCORE · {values.length} MEMBERS</div></div>;
}

export default function RosterDashboard({ members }) {
  const [contribution, setContribution] = useState('weekly');
  const stats = useMemo(() => {
    const classes = new Map(); const titles = new Map();
    let gearTotal = 0; let gearCount = 0; let levelTotal = 0; let levelCount = 0; let weeklyTotal = 0; let lifetimeTotal = 0; let highest = 0;
    for (const member of members) {
      const className = String(member.className || '').trim();
      if (className && className.toLowerCase() !== 'unknown') {
        const item = classes.get(className) || { name: className, count: 0, gearTotal: 0, gearCount: 0 };
        item.count += 1;
        const gear = number(member.gearScore);
        if (gear > 0) { item.gearTotal += gear; item.gearCount += 1; }
        classes.set(className, item);
      }
      const title = String(member.title || '').trim();
      if (title) titles.set(title, (titles.get(title) || 0) + 1);
      const gear = number(member.gearScore); if (gear > 0) { gearTotal += gear; gearCount += 1; highest = Math.max(highest, gear); }
      const level = number(member.level); if (level > 0) { levelTotal += level; levelCount += 1; }
      weeklyTotal += number(member.weeklyContribution); lifetimeTotal += number(member.totalContribution);
    }
    const classRows = [...classes.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).map(item => ({ name: item.name, count: item.count, share: percent(item.count, members.length), gear: item.gearCount ? whole(item.gearTotal / item.gearCount) : '—' }));
    const titleRows = [...titles].map(([name, count]) => ({ name, count, share: percent(count, members.length) })).sort((a, b) => b.count - a.count);
    const top = [...members].sort((a, b) => number(b[contribution === 'weekly' ? 'weeklyContribution' : 'totalContribution']) - number(a[contribution === 'weekly' ? 'weeklyContribution' : 'totalContribution'])).slice(0, 10);
    return { classes: classRows, titles: titleRows, gearAverage: gearCount ? gearTotal / gearCount : 0, levelAverage: levelCount ? levelTotal / levelCount : 0, weeklyTotal, lifetimeTotal, highest, top };
  }, [members, contribution]);
  const totalContribution = contribution === 'weekly' ? stats.weeklyTotal : stats.lifetimeTotal;
  const contributionLabel = contribution === 'weekly' ? 'Weekly' : 'Lifetime';
  return <main className="page wide rd-page">
    <div className="page-title rd-title"><h1>Guild dashboard</h1><p>Guild statistics, classes, and contributions based on your latest roster.</p></div>
    <div className="rd-metrics"><Metric icon="members" label="MEMBERS" value={members.length.toLocaleString()} tone="violet"/><Metric icon="level" label="AVG LEVEL" value={stats.levelAverage ? stats.levelAverage.toFixed(1) : '—'} tone="lavender"/><Metric icon="gear" label="AVG GEAR SCORE" value={stats.gearAverage ? whole(stats.gearAverage) : '—'} tone="violet"/><Metric icon="weekly" label="WEEKLY CONTRIBUTION" value={fmt(stats.weeklyTotal)} tone="purple"/><Metric icon="lifetime" label="LIFETIME CONTRIBUTION" value={fmt(stats.lifetimeTotal)} tone="lavender"/><Metric icon="crown" label="HIGHEST GEAR SCORE" value={stats.highest ? whole(stats.highest) : '—'} tone="violet"/></div>
    {!members.length && <section className="rd-empty-banner"><strong>Your dashboard is ready for a roster.</strong><span>Upload a CSV from Overview to see guild statistics and member rankings here.</span></section>}
    <div className="rd-top-grid"><Breakdown title="Title Distribution" icon="level" rows={stats.titles} countLabel="TITLES" members={members.length} empty="No title data found in the uploaded CSV."/><Breakdown title="Class Composition" icon="gear" rows={stats.classes} countLabel="CLASSES" members={members.length} empty="Class data will appear after importing a CSV with a Class column."/></div>
    <div className="rd-bottom-grid"><section className="rd-panel rd-ranking"><div className="rd-tabs"><button className={contribution === 'weekly' ? 'selected' : ''} onClick={() => setContribution('weekly')}>Weekly Contribution</button><button className={contribution === 'lifetime' ? 'selected' : ''} onClick={() => setContribution('lifetime')}>Lifetime Contribution</button></div><header className="rd-panel-heading"><h2>🏆 {contributionLabel} Contribution Ranking (Top 10)</h2><span>{fmt(totalContribution)} TOTAL</span></header><div className="rd-table-wrap"><table><thead><tr><th>#</th><th>PLAYER</th><th>CLASS</th><th>{contribution.toUpperCase()}</th></tr></thead><tbody>{stats.top.map((member, index) => <tr key={member.id || member.ign}><td className="rd-rank">{index + 1}</td><td>{member.ign}</td><td>{member.className || 'Unknown'}</td><td>{fmt(member[contribution === 'weekly' ? 'weeklyContribution' : 'totalContribution'])}</td></tr>)}{!stats.top.length && <tr><td colSpan="4" className="rd-empty-cell">Upload roster data to see player rankings.</td></tr>}</tbody></table></div></section>
      <section className="rd-panel rd-strength"><header className="rd-panel-heading"><h2><Icon type="gear"/>Combat Strength</h2></header><div className="rd-strength-content"><div className="rd-highlights"><div><span><Icon type="crown"/> HIGHEST GEAR SCORE</span><strong>{stats.highest ? whole(stats.highest) : '—'}</strong></div><div><span><Icon type="members"/> GUILD AVERAGE</span><strong>{stats.gearAverage ? whole(stats.gearAverage) : '—'}</strong></div></div><GearDistribution members={members}/></div></section></div>
  </main>;
}
