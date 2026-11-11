import { useRef, useState } from 'react';
import Papa from 'papaparse';
import { describeImportError } from '../firebase/importRoster';

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
  const input = useRef(); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false); const [failed, setFailed] = useState(false);
  const fail = error => { setFailed(true); setBusy(false); setMessage(describeImportError(error)); };
  const importFile = file => {
    setBusy(true); setFailed(false); setMessage('Importing roster…');
    try { Papa.parse(file, { header: true, skipEmptyLines: true, error: fail, complete: async ({ data, errors }) => {
    const roster = data.map(normalized).filter(member => member.ign);
    const invalid = data.length - roster.length;
    if (!roster.length) { setBusy(false); setFailed(true); setMessage('No valid members found. Check that the file includes Player or IGN.'); return; }
    try {
      const { added, duplicates } = await onImport(roster);
      setMessage(`${added} members imported successfully${duplicates ? ` · ${duplicates} duplicate IGN skipped` : ''}${invalid ? ` · ${invalid} incomplete row skipped` : ''}. Team Builder was reset.`);
    } catch (error) { fail(error); }
    finally { setBusy(false); }
    if (errors.length) console.warn('CSV parsing warnings:', errors);
    }}); } catch (error) { fail(error); }
  };
  if (!canUpload) return <section className="upload-panel locked"><span>Roster imports are available to the workspace owner.</span></section>;
  return <section className="upload-panel">
    <div><p className="eyebrow">ROSTER SYNC</p><h2>Import roster</h2><p>Upload a CSV export to replace the roster and reset the active Team Builder.</p></div>
    <button className="primary-button" disabled={busy} onClick={() => input.current.click()}>{busy ? 'Importing…' : 'Upload CSV'}</button>
    <input ref={input} type="file" accept=".csv,text/csv" hidden disabled={busy} onChange={event => { const file = event.target.files[0]; event.target.value = ''; if (file) importFile(file); }} />
    {message && <p className={`import-message${failed ? ' import-error' : ''}`} role={failed ? 'alert' : 'status'}>{message}</p>}
  </section>;
}
