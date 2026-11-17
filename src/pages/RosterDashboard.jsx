import { useMemo, useState } from 'react';
import { buildRosterAnalytics } from '../utils/rosterAnalytics';
import JobIcon from '../components/JobIcon';
import '../roster-dashboard.css';

const whole = value => value === null || value === undefined ? '—' : Math.round(value).toLocaleString();
const percent = value => `${(value * 100).toFixed(1)}%`;

function Icon({ type }) {
  const paths = {
    members: <><circle cx="9" cy="8" r="3"/><path d="M3 19c0-3 2.5-5 6-5s6 2 6 5M16 5a3 3 0 0 1 0 6m2 3c2 .6 3 2.2 3 4"/></>,
    level: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z"/>,
    gear: <><path d="m5 4 14 16M19 4 5 20M8 4l2 2m6 12 2 2M16 4l-2 2M8 18l-2 2"/><path d="m5 4 4 1 1-2m9 1-4 1-1-2M5 20l4-1 1 2m9-1-4-1-1 2"/></>,
    weekly: <><ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v4c0 1.7 3.6 3 8 3s8-1.3 8-3V6m-16 4v4c0 1.7 3.6 3 8 3s8-1.3 8-3v-4m-16 4v4c0 1.7 3.6 3 8 3s8-1.3 8-3v-4"/></>,
    lifetime: <><path d="M4 16c-3-5 1-9 5-6l3 4 3-4c4-3 8 1 5 6l-4 5H8z"/><path d="M12 14v7"/></>,
    crown: <path d="m3 8 5 4 4-7 4 7 5-4-2 11H5zM5 22h14"/>,
  };
  return <svg className="rd-icon" viewBox="0 0 24 24" aria-hidden="true">{paths[type]}</svg>;
}

function Metric({ icon, label, value, note, tone }) {
  return <section className="rd-metric"><span className={`rd-metric-icon ${tone}`}><Icon type={icon}/></span><div><small>{label}</small><strong>{value}</strong>{note && <span className="rd-metric-note">{note}</span>}</div></section>;
}

function Breakdown({ title, icon, rows, countLabel, total, isTitles = false }) {
  return <section className="rd-panel rd-breakdown">
    <header className="rd-panel-heading"><h2><Icon type={icon}/>{title}</h2><span>{rows.length} {countLabel} · {total} MEMBERS</span></header>
    {rows.length ? <div className="rd-table-wrap"><table><thead><tr><th>{isTitles ? 'TITLE' : 'CLASS'}</th><th>COUNT</th><th>SHARE</th>{isTitles ? <th>DISTRIBUTION</th> : <th>AVG GEAR</th>}</tr></thead><tbody>{rows.map(row => <tr key={row.name}>
      <td>{isTitles ? <span className="rd-title-name"><span className="rd-dot"/>{row.name}</span> : <span className="rd-class-name"><JobIcon className={row.name}/>{row.name}</span>}</td><td>{row.count}</td><td>{percent(row.share)}</td>
      <td>{isTitles ? <div className="rd-progress" role="img" aria-label={`${row.name}: ${percent(row.share)} of members`}><span style={{ width: `${Math.max(0, Math.min(100, row.share * 100))}%` }}/></div> : whole(row.averageGearScore)}</td>
    </tr>)}</tbody></table></div> : <p className="rd-empty">No {isTitles ? 'title' : 'class'} values were found in the uploaded roster.</p>}
  </section>;
}

function curvePath(points) {
  if (points.length < 2) return points.length ? `M ${points[0].x} ${points[0].y}` : '';
  return points.slice(1).reduce((path, point, index) => {
    const previous = points[index];
    const before = points[Math.max(0, index - 1)];
    const after = points[Math.min(points.length - 1, index + 2)];
    const firstControl = { x: previous.x + (point.x - before.x) / 6, y: previous.y + (point.y - before.y) / 6 };
    const secondControl = { x: point.x - (after.x - previous.x) / 6, y: point.y - (after.y - previous.y) / 6 };
    return `${path} C ${firstControl.x} ${firstControl.y}, ${secondControl.x} ${secondControl.y}, ${point.x} ${point.y}`;
  }, `M ${points[0].x} ${points[0].y}`);
}

function GearDistribution({ distribution }) {
  if (!distribution.bins.length) return <p className="rd-empty">No Gear Score data is available to chart.</p>;
  const plot = { left: 38, right: 372, top: 25, bottom: 164 };
  const chartWidth = plot.right - plot.left;
  const scoreRange = distribution.maximum - distribution.minimum;
  const x = score => scoreRange === 0 ? (plot.left + plot.right) / 2 : plot.left + (score - distribution.minimum) / scoreRange * chartWidth;
  const y = count => plot.bottom - count / distribution.maximumCount * (plot.bottom - plot.top);
  const peakIndex = distribution.bins.findIndex(bin => bin.count === distribution.maximumCount);
  const points = distribution.bins.map(bin => ({
    x: x(bin.start + (bin.end - bin.start) / 2),
    y: y(bin.count),
    count: bin.count,
  }));
  const peak = points[peakIndex];
  const line = points.length === 1
    ? `M ${plot.left} ${plot.bottom} Q ${peak.x} ${plot.top} ${peak.x} ${peak.y} Q ${peak.x} ${plot.top} ${plot.right} ${plot.bottom}`
    : curvePath(points);
  const area = points.length === 1
    ? `${line} Z`
    : `M ${plot.left} ${plot.bottom} L ${points[0].x} ${points[0].y}${line.slice(line.indexOf(' C'))} L ${plot.right} ${plot.bottom} Z`;
  const yTicks = [...new Set([0, Math.ceil(distribution.maximumCount / 3), Math.ceil(distribution.maximumCount * 2 / 3), distribution.maximumCount])].sort((a, b) => a - b);
  const scoreTicks = scoreRange === 0 ? [distribution.minimum] : Array.from({ length: 6 }, (_, index) => distribution.minimum + scoreRange * index / 5);
  const formatAxis = value => value >= 10000 ? `${Math.round(value / 1000)}K` : Math.round(value).toLocaleString();
  return <div className="rd-chart"><svg viewBox="0 0 400 218" role="img" aria-label={`Gear score distribution from ${formatAxis(distribution.minimum)} to ${formatAxis(distribution.maximum)}`}>
    <defs><linearGradient id="gearFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#b66cf2" stopOpacity=".7"/><stop offset="1" stopColor="#7728be" stopOpacity=".08"/></linearGradient></defs>
    {yTicks.map(tick => <g key={`y-${tick}`}><path className="rd-gridline" d={`M${plot.left} ${y(tick)}H${plot.right}`}/><text x="30" y={y(tick) + 4} textAnchor="end">{tick}</text></g>)}
    {scoreTicks.map((tick, index) => <g key={`x-${index}`}><path className="rd-gridline rd-gridline-vertical" d={`M${x(tick)} ${plot.top}V${plot.bottom}`}/><text x={x(tick)} y="188" textAnchor="middle">{formatAxis(tick)}</text></g>)}
    <path className="rd-axis" d={`M${plot.left} ${plot.top}V${plot.bottom}H${plot.right}`}/>
    <path d={area} fill="url(#gearFill)"/>
    <path d={line} className="rd-distribution-curve"/>
    <path d={`M${peak.x} ${plot.top}V${plot.bottom}`} className="rd-peak-guide"/>
    <circle cx={peak.x} cy={peak.y} r="4" className="rd-peak-dot"><title>{`${peak.count} members in this gear score range`}</title></circle>
  </svg><div className="rd-chart-label">GEAR SCORE</div></div>;
}

function Ranking({ metric }) {
  return <div className="rd-table-wrap"><table><thead><tr><th>#</th><th>PLAYER</th><th>CLASS</th><th>CONTRIBUTION</th></tr></thead><tbody>
    {metric.top10.map((member, index) => <tr key={`${member.name}-${index}`}><td className="rd-rank">{index + 1}</td><td>{member.name}</td><td>{member.className}</td><td>{whole(member.score)}</td></tr>)}
    {!metric.top10.length && <tr><td colSpan="4" className="rd-empty-cell">No contribution data is available.</td></tr>}
  </tbody></table></div>;
}

export default function RosterDashboard({ members }) {
  const [contribution, setContribution] = useState('weekly');
  const analytics = useMemo(() => buildRosterAnalytics(members), [members]);
  const currentContribution = contribution === 'weekly' ? analytics.weeklyContribution : analytics.lifetimeContribution;
  return <main className="page wide rd-page">
    <div className="page-title rd-title"><h1>Guild dashboard</h1><p>Guild statistics, classes, and contributions based on your latest roster.</p></div>
    <div className="rd-metrics">
      <Metric icon="members" label="MEMBERS" value={analytics.totalMembers.toLocaleString()} tone="violet"/>
      <Metric icon="level" label="AVG LEVEL" value={analytics.averageLevel === null ? '—' : analytics.averageLevel.toFixed(1)} tone="lavender"/>
      <Metric icon="gear" label="AVG GEAR SCORE" value={whole(analytics.averageGearScore)} tone="violet"/>
      <Metric icon="weekly" label="WEEKLY CONTRIBUTION" value={whole(analytics.weeklyContribution.total)} tone="purple"/>
      <Metric icon="lifetime" label="LIFETIME CONTRIBUTION" value={whole(analytics.lifetimeContribution.total)} tone="lavender"/>
      <Metric icon="crown" label="HIGHEST GEAR SCORE" value={whole(analytics.highestGear?.score)} note={analytics.highestGear?.name || ''} tone="violet"/>
    </div>
    {!members.length && <section className="rd-empty-banner"><strong>Your dashboard is ready for a roster.</strong><span>Upload a CSV from Overview to see guild statistics and member rankings here.</span></section>}
    <div className="rd-top-grid"><Breakdown title="Title Distribution" icon="level" rows={analytics.titles} countLabel="TITLES" total={analytics.totalMembers} isTitles/><Breakdown title="Class Composition" icon="gear" rows={analytics.classes} countLabel="CLASSES" total={analytics.totalMembers}/></div>
    <div className="rd-bottom-grid"><section className="rd-panel rd-ranking"><div className="rd-tabs"><button className={contribution === 'weekly' ? 'selected' : ''} aria-pressed={contribution === 'weekly'} onClick={() => setContribution('weekly')}>Weekly Contribution</button><button className={contribution === 'lifetime' ? 'selected' : ''} aria-pressed={contribution === 'lifetime'} onClick={() => setContribution('lifetime')}>Lifetime Contribution</button></div><header className="rd-panel-heading"><h2>🏆 {contribution === 'weekly' ? 'Weekly' : 'Lifetime'} Contribution Ranking (Top 10)</h2><span>{whole(currentContribution.total)} TOTAL</span></header><Ranking metric={currentContribution}/></section>
      <section className="rd-panel rd-strength"><header className="rd-panel-heading"><h2><Icon type="gear"/>Combat Strength</h2></header><div className="rd-strength-content"><div className="rd-highlights">
        <div><span><Icon type="crown"/> HIGHEST GEAR SCORE</span><strong>{whole(analytics.highestGear?.score)}</strong><small>{analytics.highestGear?.name || '—'}</small></div>
        <div><span><Icon type="members"/> GUILD AVERAGE</span><strong>{whole(analytics.averageGearScore)}</strong><small>{analytics.gearCount ? 'Roster average' : '—'}</small></div>
        <div><span><Icon type="level"/> LOWEST GEAR SCORE</span><strong>{whole(analytics.lowestGear?.score)}</strong><small>{analytics.lowestGear?.name || '—'}</small></div>
      </div><GearDistribution distribution={analytics.gearDistribution}/></div></section></div>
  </main>;
}
