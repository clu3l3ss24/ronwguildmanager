import AutoFillDialog from '../components/AutoFillDialog';
﻿import { useEffect, useRef, useState } from 'react';
import TeamBoard from '../components/TeamBoard';
import FormationLibrary from '../components/FormationLibrary';
import { autoBalanceBoard, BOARD_MODES } from '../firebase/board';
import '../formations.css';

export default function Teams({ members, teams, guildName, mode, teamNames, groupNames, staticParties, staticPartyNames, activeUsers, selectMode, onTeamsChange, editable, generate, clear, save, savedTeams, load, deleteSaved, busy, notice, activeSaveId, staticOnly = false, board }) {
  const [statusFilter, setStatusFilter] = useState('all');
  const heading = useRef(null);
  const [showAutoFill, setShowAutoFill] = useState(false);
  const [formationControls, setFormationControls] = useState(null);
  const [teamActionsTarget, setTeamActionsTarget] = useState(null);
  const [subMode, setSubMode] = useState(false);
  const sub = mode === 'guild-league' ? (board?.sub || { teams: {}, teamNames: {}, groupNames: {} }) : null;
  const activeTeams = subMode && sub ? sub.teams : teams;
  const activeTeamNames = subMode && sub ? sub.teamNames : teamNames;
  const activeGroupNames = subMode && sub ? sub.groupNames : groupNames;
  const updateActiveTeams = next => onTeamsChange(subMode ? { ...board, sub: next } : next);
  const clearActive = () => subMode ? onTeamsChange({ ...board, sub: { teams: {}, teamNames: {}, groupNames: {} } }) : clear();
  const generateActive = (status, preferences) => {
    if (!subMode) return generate(status, preferences);
    const mainAssigned = new Set(Object.values(teams).flat(2).filter(Boolean));
    const next = autoBalanceBoard(members.filter(member => !mainAssigned.has(member.id)), { mode, capacity: 90, teams: activeTeams, teamNames: activeTeamNames, groupNames: activeGroupNames }, status, preferences);
    updateActiveTeams(next);
    return true;
  };
  useEffect(() => {
    const element = heading.current;
    const updateHeight = () => element.closest('main').style.setProperty('--team-toolbar-height', `${element.getBoundingClientRect().height}px`);
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const hasOpenSlots = Object.values(activeTeams).flat().some(party => party.some(id => !id));
  return <main className="page wide team-builder-page"><div ref={heading} className="page-title inline-title team-builder-heading"><div><p className="eyebrow">{staticOnly ? 'GUILD STATIC ROSTER' : 'BATTLEFIELD PLANNER'}</p><h1>{staticOnly ? 'Guild static roster' : 'Team builder'}</h1><p>{staticOnly ? 'Changes to your guild parties save automatically.' : 'Board changes save automatically. Keep reusable setups in your workspace playbook.'}</p></div>{editable && <div className="team-actions">{!staticOnly && <div className="formation-header-controls" ref={setFormationControls} />}<>{!staticOnly && <button className="primary-button" onClick={() => setShowAutoFill(true)} disabled={busy || !hasOpenSlots} title={`Fill empty slots using ${statusFilter === 'all' ? 'all statuses' : statusFilter} members. Assigned players stay in place.`}>Auto-balance teams</button>}{!staticOnly && <button className="clear-button" onClick={clearActive} disabled={busy}>Clear All</button>}</></div>}</div>
    <section className="battle-mode">{!staticOnly && <><label>Battle mode<select aria-label="Battle mode" value={mode} onChange={event => selectMode(event.target.value)} disabled={!editable || busy}>{Object.entries(BOARD_MODES).map(([id, config]) => <option key={id} value={id}>{config.name}</option>)}</select></label><p>{mode === 'siege' ? 'Open teams — add as many five-person teams as you need.' : `Up to ${BOARD_MODES[mode].players} players across ${BOARD_MODES[mode].players / 5} five-person parties.`} Create and name your teams, then add parties inside each one.</p></>}{staticOnly && <p>One guild roster · add as many five-person parties as you need.</p>}<div className="team-header-actions" ref={setTeamActionsTarget} /></section>
    {!staticOnly && editable && <FormationLibrary controlsTarget={formationControls} board={{ teams, mode, teamNames, groupNames }} members={members} savedTeams={savedTeams} activeSaveId={activeSaveId} save={save} load={load} deleteSaved={deleteSaved} busy={busy} />}
    {!editable && <p className="permission-note">Shared access: your role can view team formations only.</p>}
    {!staticOnly && showAutoFill && <AutoFillDialog members={members} status={statusFilter} busy={busy} generate={generateActive} onClose={() => setShowAutoFill(false)} />}
    <TeamBoard activeUsers={activeUsers} staticParties={staticParties} staticPartyNames={staticPartyNames} staticOnly={staticOnly} teamActionsTarget={teamActionsTarget} guildName={guildName} members={members} teams={activeTeams} mode={mode} teamNames={activeTeamNames} groupNames={activeGroupNames} statusFilter={statusFilter} setStatusFilter={setStatusFilter} onTeamsChange={updateActiveTeams} editable={editable && !busy} subMode={subMode} onToggleSub={() => setSubMode(value => !value)} mainTeams={teams} subTeams={sub?.teams || {}} />
  </main>;
}

