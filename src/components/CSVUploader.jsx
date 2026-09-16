import { useRef, useState } from 'react';
import Papa from 'papaparse';

const value = (row, keys) => keys.map(key => row[key]).find(item => item !== undefined && String(item).trim() !== '') ?? '';
const normalized = (row) => {
  const ign = String(value(row, ['Player Name / IGN', 'Player', 'IGN', 'Player Name'])).trim();
  return {
    ign, level: value(row, ['Level', 'Lv.', 'Lv']), className: String(value(row, ['Class'])).trim() || 'Unknown',
    gearScore: Number(String(value(row, ['Gear Score', 'GearScore'])).replace(/[^0-9.]/g, '')) || 0,
    gender: value(row, ['Gender']), guildPosition: value(row, ['Guild Position', 'Position']),
    weeklyContribution: value(row, ['Weekly Contribution', 'Weekly']), totalContribution: value(row, ['Total Contribution']),
    online: /online/i.test(String(value(row, ['Online Status', 'Status']))),
  };
};

export default function CSVUploader({ onImport, canUpload }) {
  const input = useRef(); const [message, setMessage] = useState('');
  const importFile = (file) => Papa.parse(file, { header: true, skipEmptyLines: true, complete: ({ data, errors }) => {
    const roster = data.map(normalized).filter(member => member.ign);
    const invalid = data.length - roster.length;
    if (!roster.length) return setMessage('No valid members found. Check that the file includes Player or IGN.');
    onImport(roster).then(({ added, duplicates }) => setMessage(`${added} members imported successfully${duplicates ? ` · ${duplicates} duplicate IGN skipped` : ''}${invalid ? ` · ${invalid} incomplete row skipped` : ''}. Team Builder was reset.`));
    if (errors.length) console.warn('CSV parsing warnings:', errors);
  }});
  if (!canUpload) return <section className="upload-panel locked"><span>CSV uploads are restricted to Guild Masters.</span></section>;
  return <section className="upload-panel">
    <div><p className="eyebrow">ROSTER SYNC</p><h2>Import guild roster</h2><p>Upload a CSV export to replace the roster and reset the active Team Builder.</p></div>
    <button className="primary-button" onClick={() => input.current.click()}>Upload CSV</button>
    <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={e => e.target.files[0] && importFile(e.target.files[0])} />
    {message && <p className="import-message">{message}</p>}
  </section>;
}
