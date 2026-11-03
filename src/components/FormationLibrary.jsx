import { createPortal } from 'react-dom';
﻿import { useEffect, useId, useRef, useState } from 'react';
import { BOARD_MODES, formationSaveError } from '../firebase/board';

export default function FormationLibrary({ controlsTarget, board, members, savedTeams, activeSaveId, save, load, deleteSaved, busy }) {
  const [view, setView] = useState(null);
  const [name, setName] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [saveTarget, setSaveTarget] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const dialog = useRef(null);
  const titleId = useId();
  const descriptionId = useId();
  const selected = savedTeams.find(snapshot => snapshot.id === selectedId);
  const validation = formationSaveError(board, members);

  useEffect(() => {
    if (view && !dialog.current.open) dialog.current.showModal();
    if (!view && dialog.current.open) dialog.current.close();
  }, [view]);
  useEffect(() => {
    if (!view) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [view]);

  const openSave = () => {
    setMessage(''); setError(validation);
    if (validation) return;
    const recent = savedTeams.find(item => item.id === activeSaveId);
    setSaveTarget(recent?.id || ''); setName(recent?.name || ''); setView('save');
  };
  const openLoad = () => { setError(''); setMessage(''); setSelectedId(null); setView('load'); };
  const close = () => { if (!busy) { setView(null); setError(''); setMessage(''); } };
  const keepFocusInWindow = event => {
    if (event.key !== 'Tab') return;
    const controls = [...dialog.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')].filter(element => element.getClientRects().length);
    const first = controls[0]; const last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };
  const submit = async event => {
    event.preventDefault();
    if (validation) { setError(validation); return; }
    setError('');
    const target = saveTarget && savedTeams.find(item => item.id === saveTarget);
    if (saveTarget && !target) { setError('This save slot no longer exists. Choose another slot or create a new one.'); return; }
    if (target && !window.confirm(`Update saved formation "${target.name}" with the current teams? This replaces its saved setup.`)) return;
    if (await save(name, saveTarget || null)) setView(null);
    else setError('The formation could not be saved. Check that it is complete and your guild connection is active, then retry.');
  };
  const loadSelected = async () => {
    if (!selected) return;
    setError(''); setMessage('');
    if (await load(selected)) setView(null);
    else setError('The formation could not be loaded. Check your connection and guild access, then retry.');
  };
  const deleteSelected = async () => {
    if (!selected || !window.confirm(`Delete saved formation "${selected.name}"? The active board will remain unchanged.`)) return;
    setError(''); setMessage('');
    if (await deleteSaved(selected.id)) { setSelectedId(null); setMessage('Save slot deleted. The active board is unchanged.'); }
    else setError('The save slot could not be deleted. Please try again.');
  };
  const feedback = <>{error && <p className="formation-validation" role="alert">{error}</p>}{message && <p className="formation-notice" role="status">{message}</p>}</>;

  return <>
    {controlsTarget && createPortal(<><button className="primary-button" disabled={busy} onClick={openSave}>Save formation</button><button className="user-button" disabled={busy} onClick={openLoad}>Load formation</button></>, controlsTarget)}
    {!view && feedback}
    <dialog className="formation-dialog" ref={dialog} aria-labelledby={titleId} aria-describedby={descriptionId} aria-busy={busy} onKeyDown={keepFocusInWindow} onCancel={event => { if (busy) event.preventDefault(); else close(); }} onClose={() => { if (!dialog.current.open) setView(null); }}>
      <header className="formation-dialog-heading"><div><p className="eyebrow">GUILD PLAYBOOK</p><h2 id={titleId}>{view === 'save' ? 'Save formation' : 'Load formation'}</h2></div><button className="user-button" disabled={busy} onClick={close} aria-label="Close formation window">Close</button></header>
      <p id={descriptionId} className="formation-dialog-description">{view === 'save' ? 'Update an existing save slot or create a new one. The last loaded or saved slot is selected automatically.' : 'Choose a save slot to restore its teams, parties, assignments, and battle mode.'}</p>
      {feedback}
      {view === 'save' ? <form onSubmit={submit} className="formation-dialog-save"><label>Save slot<select aria-label="Save slot" value={saveTarget} disabled={busy} onChange={event => { const id = event.target.value; setSaveTarget(id); setName(savedTeams.find(item => item.id === id)?.name || ''); setError(''); }}><option value="">Create a new save slot</option>{savedTeams.map((snapshot, index) => <option key={snapshot.id} value={snapshot.id}>Slot {index + 1}: {snapshot.name}</option>)}</select></label>{saveTarget && <p>The selected slot will be replaced with your current formation.</p>}<label>Formation name<input value={name} onChange={event => setName(event.target.value)} required maxLength={80} placeholder="e.g. Castle defense" disabled={busy} autoFocus /></label><p>{BOARD_MODES[board.mode].name}{Number.isFinite(BOARD_MODES[board.mode].players) ? ` · ${BOARD_MODES[board.mode].players} players ready` : ' · Open formation size'}</p><footer><button className="user-button" type="button" disabled={busy} onClick={close}>Cancel</button><button className="primary-button" disabled={busy || !name.trim()}>{busy ? 'Saving…' : saveTarget ? 'Update selected slot' : 'Save to new slot'}</button></footer></form> : <>
        {savedTeams.length ? <ol className="save-slot-grid">{savedTeams.map((snapshot, index) => {
          const parties = Object.values(snapshot.teams).flat();
          const assigned = new Set(parties.flat().filter(Boolean)).size;
          return <li key={snapshot.id}><button className={`save-slot${selectedId === snapshot.id ? ' selected' : ''}`} aria-pressed={selectedId === snapshot.id} aria-label={`Select save slot ${index + 1}: ${snapshot.name}`} disabled={busy} onClick={() => { setSelectedId(snapshot.id); setError(''); setMessage(''); }}><span className="save-slot-number">SAVE SLOT {String(index + 1).padStart(2, '0')}</span><strong>{snapshot.name}</strong><span className="formation-mode-tag">{BOARD_MODES[snapshot.mode]?.name || 'Guild League'}</span><small>{assigned} players · {Object.keys(snapshot.teams).length} teams · {parties.length} parties</small><time dateTime={snapshot.createdAt}>{new Date(snapshot.createdAt).toLocaleString()}</time><span className="save-slot-selection">{selectedId === snapshot.id ? 'Selected' : 'Select slot'}</span></button></li>;
        })}</ol> : <div className="save-slots-empty"><h3>No saved formations yet</h3><p>Complete your formation, then use Save formation to create your first slot.</p></div>}
        <footer className="formation-dialog-footer"><button className="clear-button" disabled={busy || !selected} onClick={deleteSelected}>Delete save</button><div><button className="user-button" disabled={busy} onClick={close}>Cancel</button><button className="primary-button" disabled={busy || !selected} onClick={loadSelected}>{busy ? 'Please wait…' : 'Load selected'}</button></div></footer>
      </>}
    </dialog>
  </>;
}
