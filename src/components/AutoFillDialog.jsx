import { useEffect, useId, useRef, useState } from 'react';
import { JOB_NAMES } from './JobIcon';
import { roleForClass } from '../utils/classRoles';

export default function AutoFillDialog({ members, status, busy, generate, onClose }) {
  const dialog = useRef(null);
  const title = useId();
  const [preferences, setPreferences] = useState(() => Array.from({ length: 5 }, () => ({ role: 'any', job: '' })));
  const [error, setError] = useState('');
  const jobs = [...new Map([...JOB_NAMES, ...members.map(member => member.className).filter(Boolean)].map(name => [name.toLowerCase().replace(/[^a-z0-9]/g, ''), name])).values()].sort((a, b) => a.localeCompare(b));
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { element.close(); document.body.style.overflow = previous; };
  }, []);
  const update = (index, value) => setPreferences(current => current.map((item, i) => i === index ? { ...item, ...value } : item));
  const submit = async event => {
    event.preventDefault(); setError('');
    if (await generate(status, preferences)) onClose();
    else setError('Could not fill the parties. Check your connection and try again.');
  };
  return <dialog ref={dialog} className="formation-dialog autofill-dialog" aria-labelledby={title} aria-busy={busy} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <header className="formation-dialog-heading"><div><p className="eyebrow">PARTY PREFERENCES</p><h2 id={title}>Auto-balance teams</h2></div><button className="user-button" disabled={busy} onClick={onClose}>Close</button></header>
    <p className="formation-dialog-description">These five slot preferences apply to every existing party. Only empty slots are filled; assigned members stay in place. Highest gear score wins among matching, unassigned members.</p>
    <p className="formation-dialog-description">Roster status: <strong>{status === 'all' ? 'All statuses' : status === 'online' ? 'Online' : 'Offline'}</strong>. Specific jobs are filled first, then roles, then Any. Slots without a matching player stay empty.</p>
    <form onSubmit={submit}><div className="autofill-preferences">{preferences.map((preference, index) => <fieldset key={index}><legend>Slot {index + 1}</legend><label>Role<select aria-label={`Slot ${index + 1} role`} value={preference.role} disabled={busy} onChange={event => update(index, { role: event.target.value, job: '' })}><option value="any">Any</option><option value="tank">Tank</option><option value="healer">Healer</option><option value="dps">DPS</option></select></label><label>Job<select aria-label={`Slot ${index + 1} job`} value={preference.job} disabled={busy || preference.role === 'any'} onChange={event => update(index, { job: event.target.value })}><option value="">Any {preference.role === 'any' ? 'job' : preference.role === 'dps' ? 'DPS job' : preference.role}</option>{jobs.filter(job => roleForClass(job).toLowerCase() === preference.role).map(job => <option key={job} value={job}>{job}</option>)}</select></label></fieldset>)}</div>
      {error && <p role="alert" className="formation-validation">{error}</p>}
      <footer className="formation-dialog-footer"><button type="button" className="user-button" disabled={busy} onClick={onClose}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? 'Filling...' : 'Fill empty slots'}</button></footer>
    </form>
  </dialog>;
}
