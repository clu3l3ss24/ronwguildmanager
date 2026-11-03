import AutoFillDialog from '../components/AutoFillDialog';
﻿import { useEffect, useRef, useState } from 'react';
import TeamBoard from '../components/TeamBoard';
import FormationLibrary from '../components/FormationLibrary';
import { BOARD_MODES } from '../firebase/board';
import '../formations.css';

export default function Teams({ members, teams, guildName, mode, teamNames, groupNames, selectMode, onTeamsChange, editable, generate, clear, save, savedTeams, load, deleteSaved, busy, notice, activeSaveId, undo, redo, canUndo, canRedo }) {
  const [statusFilter, setStatusFilter] = useState('all');
  const heading = useRef(null);
  const [showAutoFill, setShowAutoFill] = useState(false);
  const [formationControls, setFormationControls] = useState(null);
  useEffect(() => {
    const element = heading.current;
    const updateHeight = () => element.closest('main').style.setProperty('--team-toolbar-height', `${element.getBoundingClientRect().height}px`);
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const hasOpenSlots = Object.values(teams).flat().some(party => party.some(id => !id));
  return <main className="page wide team-builder-page"><div ref={heading} className="page-title inline-title team-builder-heading"><div><p className="eyebrow">BATTLEFIELD PLANNER</p><h1>Team builder</h1><p>Board changes save automatically. Keep reusable setups in your guild playbook.</p></div>{editable && <div className="team-actions"><div className="formation-header-controls" ref={setFormationControls} /><button className="user-button" onClick={undo} disabled={busy || !canUndo}>Undo</button><button className="user-button" onClick={redo} disabled={busy || !canRedo}>Redo</button><button className="primary-button" onClick={() => setShowAutoFill(true)} disabled={busy || !hasOpenSlots} title={`Fill empty slots using ${statusFilter === 'all' ? 'all statuses' : statusFilter} members. Assigned players stay in place.`}>Auto-balance teams</button><button className="clear-button" onClick={clear} disabled={busy}>Clear All</button></div>}</div>
    {busy && <p className="formation-notice" role="status">Saving your change…</p>}
    {notice && !busy && <p className="formation-notice" role="status">{notice}</p>}
    <section className="battle-mode"><label>Battle mode<select aria-label="Battle mode" value={mode} onChange={event => selectMode(event.target.value)} disabled={!editable || busy}>{Object.entries(BOARD_MODES).map(([id, config]) => <option key={id} value={id}>{config.name}</option>)}</select></label><p>{mode === 'siege' ? 'Open teams — add as many five-person teams as you need.' : `Up to ${BOARD_MODES[mode].players} players across ${BOARD_MODES[mode].players / 5} five-person parties.`} Create and name your teams, then add parties inside each one.</p></section>
    {editable && <FormationLibrary controlsTarget={formationControls} board={{ teams, mode, teamNames, groupNames }} members={members} savedTeams={savedTeams} activeSaveId={activeSaveId} save={save} load={load} deleteSaved={deleteSaved} busy={busy} />}
    {!editable && <p className="permission-note">Member access: your role can view team formations only.</p>}
    {showAutoFill && <AutoFillDialog members={members} status={statusFilter} busy={busy} generate={generate} onClose={() => setShowAutoFill(false)} />}
    <TeamBoard guildName={guildName} members={members} teams={teams} mode={mode} teamNames={teamNames} groupNames={groupNames} statusFilter={statusFilter} setStatusFilter={setStatusFilter} onTeamsChange={onTeamsChange} editable={editable && !busy} />
  </main>;
}

