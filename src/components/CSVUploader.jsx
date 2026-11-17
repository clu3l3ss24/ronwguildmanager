import { useRef, useState } from 'react';
import Papa from 'papaparse';
import { describeImportError } from '../firebase/importRoster';
import { parseRosterCsv } from '../utils/rosterCsv';

export default function CSVUploader({ onImport, canUpload }) {
  const input = useRef();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const fail = error => { setFailed(true); setBusy(false); setMessage(error?.code === 'csv/invalid' ? error.message : describeImportError(error)); };
  const importFile = async file => {
    setBusy(true); setFailed(false); setMessage('Validating CSV…');
    try {
      const { members, warnings } = await parseRosterCsv(file, Papa);
      setMessage('CSV validated. Importing roster…');
      const { added, duplicates } = await onImport(members);
      const skipped = warnings.emptyPlayerNames ? ` · ${warnings.emptyPlayerNames} empty player row${warnings.emptyPlayerNames === 1 ? '' : 's'} skipped` : '';
      const invalidMetrics = Object.values(warnings.invalidNumericFields).reduce((sum, count) => sum + count, 0);
      const numericNote = invalidMetrics ? ` · ${invalidMetrics} invalid numeric value${invalidMetrics === 1 ? '' : 's'} omitted from calculations` : '';
      const duplicateNote = duplicates ? ` · ${duplicates} duplicate record${duplicates === 1 ? '' : 's'} skipped` : '';
      setMessage(`${added} members imported successfully${duplicateNote}${skipped}${numericNote}. Team Builder was reset.`);
    } catch (error) { fail(error); }
    finally { setBusy(false); }
  };
  if (!canUpload) return <section className="upload-panel locked"><span>Roster imports are available to the workspace owner.</span></section>;
  return <section className="upload-panel">
    <div><p className="eyebrow">ROSTER SYNC</p><h2>Import roster</h2><p>Upload a CSV export to replace the roster and reset the active Team Builder.</p></div>
    <button className="primary-button" disabled={busy} onClick={() => input.current.click()}>{busy ? 'Importing…' : 'Upload CSV'}</button>
    <input ref={input} type="file" accept=".csv,text/csv" hidden disabled={busy} onChange={event => { const file = event.target.files[0]; event.target.value = ''; if (file) importFile(file); }} />
    {message && <p className={`import-message${failed ? ' import-error' : ''}`} role={failed ? 'alert' : 'status'}>{message}</p>}
  </section>;
}
