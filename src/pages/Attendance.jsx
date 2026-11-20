import { useMemo, useState } from 'react';
import { attendanceMember, normalizeAttendanceName, parseAttendancePaste } from '../utils/attendance';
import '../attendance.css';

const formatDate = value => new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

function eventForDate(date) {
  const weekday = new Date(`${date}T12:00:00`).getDay();
  if (weekday === 2 || weekday === 4) return 'Guild League';
  if (weekday === 0) return 'Guild Siege';
  return 'No scheduled event';
}

function AbsenceChart({ rows }) {
  const counts = new Map();
  rows.forEach(row => counts.set(row.date, (counts.get(row.date) || 0) + 1));
  const points = [...counts].sort(([a], [b]) => a.localeCompare(b));
  const width = Math.max(720, points.length * 82);
  const height = 250;
  const left = 48, right = 18, top = 16, bottom = 52;
  const max = Math.max(1, ...points.map(([, count]) => count));
  const step = points.length > 1 ? (width - left - right) / (points.length - 1) : 0;
  const y = count => height - bottom - (count / max) * (height - top - bottom);
  const coords = points.map(([, count], index) => `${left + index * step},${y(count)}`).join(' ');
  const ticks = Math.min(4, max);
  return <div className="attendance-chart-scroll"><svg className="attendance-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Absent headcount by date">
    <text className="attendance-axis-title" transform={`translate(14 ${height / 2}) rotate(-90)`}>Absent HC</text>
    {Array.from({ length: ticks + 1 }, (_, index) => {
      const value = Math.round((max / ticks) * index);
      const py = y(value);
      return <g key={index}><line className="attendance-gridline" x1={left} x2={width - right} y1={py} y2={py}/><text className="attendance-tick" x={left - 10} y={py + 4} textAnchor="end">{value}</text></g>;
    })}
    {points.length > 1 && <polyline className="attendance-line" points={coords}/>}
    {points.map(([date, count], index) => {
      const px = left + index * step, py = y(count);
      return <g key={date}><circle className="attendance-point" cx={px} cy={py} r="4"/><text className="attendance-date-tick" x={px} y={height - 19} textAnchor="middle">{new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</text><title>{formatDate(date)}: {count} absent</title></g>;
    })}
    {!points.length && <text className="attendance-empty-chart" x={width / 2} y={height / 2} textAnchor="middle">Paste absence records to see the trend.</text>}
  </svg></div>;
}

export default function Attendance({ members, rows, onAppend, onReset, editable, busy }) {
  const [draft, setDraft] = useState('');
  const [nameFilter, setNameFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [eventFilter, setEventFilter] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [message, setMessage] = useState('');
  const classes = [...new Set(members.map(member => member.className).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const prepared = useMemo(() => rows.map(row => ({ ...row, member: attendanceMember(row, members), event: eventForDate(row.date) })), [rows, members]);
  const filtered = useMemo(() => prepared.filter(row => {
    const query = normalizeAttendanceName(nameFilter);
    return (!query || normalizeAttendanceName(row.name).includes(query))
      && (!dateFrom || row.date >= dateFrom)
      && (!dateTo || row.date <= dateTo)
      && (!eventFilter || row.event === eventFilter)
      && (!classFilter || row.member?.className === classFilter)
  }), [prepared, nameFilter, dateFrom, dateTo, eventFilter, classFilter]);
  const attendanceTableRows = useMemo(() => [...filtered.reduce((groups, row) => {
    const className = row.member?.className || 'Mismatch';
    const key = `${normalizeAttendanceName(row.name)}|${className}|${row.event}`;
    const group = groups.get(key) || { name: row.name, className, event: row.event, dates: new Set() };
    group.dates.add(row.date);
    groups.set(key, group);
    return groups;
  }, new Map()).values()].map(group => ({ ...group, absent: group.dates.size })), [filtered]);
  const mismatchGroups = [...prepared.filter(row => !row.member).reduce((groups, row) => {
    const key = normalizeAttendanceName(row.name);
    const group = groups.get(key) || { name: row.name, dates: [] };
    group.dates.push(row.date);
    groups.set(key, group);
    return groups;
  }, new Map()).values()].map(group => ({ ...group, dates: [...new Set(group.dates)].sort() }));
  const submit = async text => {
    const result = parseAttendancePaste(text);
    if (!result.rows.length) { setMessage(result.invalidLines.length ? `No valid rows found. Check line${result.invalidLines.length > 1 ? 's' : ''} ${result.invalidLines.join(', ')}.` : 'Paste rows in Name | Date | Day format.'); return; }
    const saved = await onAppend(result.rows);
    if (!saved) { setMessage('Could not save attendance data. Check your connection and permissions.'); return; }
    setDraft('');
    setMessage(`${result.rows.length} attendance row${result.rows.length === 1 ? '' : 's'} added.${result.invalidLines.length ? ` Skipped invalid line${result.invalidLines.length === 1 ? '' : 's'} ${result.invalidLines.join(', ')}.` : ''}`);
  };
  const reset = async () => {
    if (!rows.length || !window.confirm('Delete all attendance data? This cannot be undone.')) return;
    const success = await onReset();
    setMessage(success ? 'All attendance data was reset.' : 'Could not reset attendance data. Try again.');
  };
  return <main className="page wide attendance-page">
    <header className="page-title attendance-heading"><div><p className="eyebrow">GUILD REPORTING</p><h1>Attendance</h1><p>Track absences by date and compare names with the uploaded roster.</p></div><button className="clear-button attendance-reset" type="button" onClick={reset} disabled={!editable || busy || !rows.length}>Reset attendance</button></header>
    <section className="attendance-entry panel"><div className="attendance-entry-heading"><div><p className="eyebrow">ADD ABSENCES</p><h2>Paste attendance data</h2></div><span>{rows.length} unique records</span></div><label htmlFor="attendance-absent">Absent</label><textarea id="attendance-absent" value={draft} disabled={!editable || busy} onChange={event => setDraft(event.target.value)} onPaste={event => { event.preventDefault(); const pasted = event.clipboardData.getData('text'); setDraft(pasted); submit(pasted); }} placeholder={'Name | Date | Day\nRagnaPlayer | 11/19/2026 | Thursday\nAnotherPlayer | 11/20/2026 | Friday'} rows={5}/><div className="attendance-entry-footer"><small>One row per absence. Dates accept M/D, M/D/YYYY, or YYYY-MM-DD. Pasting saves and appends immediately.</small><button className="primary-button" type="button" disabled={!editable || busy || !draft.trim()} onClick={() => submit(draft)}>Add data</button></div>{message && <p className="attendance-message" role="status">{message}</p>}{!editable && <p className="permission-note">You can view attendance, but your role cannot change it.</p>}</section>
    <section className="attendance-panel panel"><div className="attendance-panel-heading"><div><p className="eyebrow">TREND</p><h2>Absent headcount</h2></div><span>{rows.length ? `${new Set(rows.map(row => row.date)).size} dates` : 'No data yet'}</span></div><AbsenceChart rows={rows}/></section>
    <section className="attendance-panel panel"><div className="attendance-panel-heading"><div><p className="eyebrow">ROSTER CHECK</p><h2>Name mismatches</h2></div><span>{mismatchGroups.length} unmatched name{mismatchGroups.length === 1 ? '' : 's'}</span></div><p className="attendance-note">These pasted names do not match a member name in the current uploaded roster.</p>{mismatchGroups.length ? <ul className="attendance-mismatch-list">{mismatchGroups.map(group => <li key={normalizeAttendanceName(group.name)} title={`Absent on: ${group.dates.map(formatDate).join(', ')}`}><span className="attendance-mismatch-dot" aria-hidden="true"/><strong>{group.name}</strong></li>)}</ul> : <p className="attendance-empty">No mismatches. Every absent name matches the roster.</p>}</section>
    <section className="attendance-panel panel"><div className="attendance-panel-heading"><div><p className="eyebrow">ABSENCE RECORDS</p><h2>Attendance list</h2></div><span>{attendanceTableRows.length} shown</span></div><div className="attendance-filters">
      <label>Name<input value={nameFilter} onChange={event => setNameFilter(event.target.value)} placeholder="Filter name"/></label>
      <label>From date<input type="date" value={dateFrom} onChange={event => setDateFrom(event.target.value)}/></label>
      <label>To date<input type="date" value={dateTo} onChange={event => setDateTo(event.target.value)}/></label>
      <label>Event<select value={eventFilter} onChange={event => setEventFilter(event.target.value)}><option value="">All events</option><option>Guild League</option><option>Guild Siege</option><option>No scheduled event</option></select></label>
      <label>Class<select value={classFilter} onChange={event => setClassFilter(event.target.value)}><option value="">All classes</option>{classes.map(name => <option key={name}>{name}</option>)}</select></label>
    </div><div className="attendance-table-wrap"><table className="attendance-table"><thead><tr><th scope="col">Name</th><th scope="col">Class</th><th scope="col">Event</th><th scope="col">Absent</th></tr></thead><tbody>{attendanceTableRows.map(row => <tr key={`${normalizeAttendanceName(row.name)}-${row.className}-${row.event}`}><td className="attendance-name-cell">{row.name}</td><td><span className="attendance-class-chip">{row.className}</span></td><td><span className={`attendance-event-chip ${row.event === 'Guild League' ? 'league' : row.event === 'Guild Siege' ? 'siege' : 'other'}`}>{row.event}</span></td><td><span className="attendance-absent-count">{row.absent}</span></td></tr>)}</tbody></table>{!attendanceTableRows.length && <p className="attendance-empty">No absence records match these filters.</p>}</div></section>
  </main>;
}
