import { DndContext, DragOverlay, PointerSensor, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import MemberCard from './MemberCard';
import TeamSlot, { DraggableMember } from './TeamSlot';
import TeamScreenshot from './TeamScreenshot';
import '../team-screenshot.css';
import { BOARD_MODES, matchesMemberStatus, sortMembersByGearScore } from '../firebase/board';

const cloneTeams = teams => Object.fromEntries(Object.entries(teams).map(([id, parties]) => [id, parties.map(party => [...party])]));
const partySummary = (slots, members) => { const players = slots.map(id => members.find(member => member.id === id)).filter(Boolean); return { total: players.reduce((sum, member) => sum + Number(member.gearScore || 0), 0), count: players.length }; };

export default function TeamBoard({ members, teams, mode, teamNames, groupNames, statusFilter, setStatusFilter, onTeamsChange, editable, guildName }) {
  const [active, setActive] = useState(null);
  const [query, setQuery] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [newTeamName, setNewTeamName] = useState('');
  const [compactView, setCompactView] = useState(() => { try { return localStorage.getItem('ronw-team-density') !== 'comfortable'; } catch { return true; } });
  const [screenshotTeam, setScreenshotTeam] = useState(null);
  useEffect(() => { try { localStorage.setItem('ronw-team-density', compactView ? 'compact' : 'comfortable'); } catch {} }, [compactView]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const assigned = new Set(Object.values(teams).flat(2).filter(Boolean));
  const classes = useMemo(() => [...new Set(members.map(member => member.className).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [members]);
  const available = sortMembersByGearScore(members.filter(member => !assigned.has(member.id) && matchesMemberStatus(member, statusFilter) && member.ign.toLowerCase().includes(query.toLowerCase()) && (!classFilter || member.className === classFilter)));
  const limit = BOARD_MODES[mode].players;
  const full = Object.values(teams).flat().length >= limit / 5;
  const apply = (next, names = teamNames, groups = groupNames) => onTeamsChange({ teams: next, teamNames: names, groupNames: groups, mode });
  const addTeam = async event => {
    event.preventDefault();
    if (!editable || !newTeamName.trim()) return;
    const id = crypto.randomUUID();
    if (await apply({ ...teams, [id]: [] }, { ...teamNames, [id]: [] }, { ...groupNames, [id]: newTeamName.trim() })) setNewTeamName('');
  };
  const removeTeam = id => {
    if (!editable) return;
    if (teams[id].length && !window.confirm('Remove this team and all its parties? Assigned players will return to Available Members.')) return;
    const next = { ...teams }; const names = { ...teamNames }; const groups = { ...groupNames };
    delete next[id]; delete names[id]; delete groups[id];
    apply(next, names, groups);
  };
  const addParty = id => {
    if (!editable || full) return;
    apply({ ...teams, [id]: [...teams[id], Array(5).fill(null)] }, { ...teamNames, [id]: [...teamNames[id], ''] });
  };
  const removeParty = (id, partyIndex) => {
    if (!editable) return;
    if (teams[id][partyIndex].some(Boolean) && !window.confirm('Remove this party? Assigned players will return to Available Members.')) return;
    const next = cloneTeams(teams); next[id].splice(partyIndex, 1);
    apply(next, { ...teamNames, [id]: teamNames[id].filter((_, index) => index !== partyIndex) });
  };
  const updatePlacement = (memberId, target) => {
    if (!editable || !target) return;
    const next = cloneTeams(teams); let source = null;
    Object.entries(next).forEach(([id, parties]) => parties.forEach((party, partyIndex) => party.forEach((idInSlot, slotIndex) => { if (idInSlot === memberId) source = [id, partyIndex, slotIndex]; })));
    if (source) next[source[0]][source[1]][source[2]] = null;
    if (target === 'pool') return apply(next);
    const [id, partyIndex, slotIndex] = target.split(':');
    const party = next[id]?.[Number(partyIndex)]; if (!party) return;
    const displaced = party[Number(slotIndex)]; party[Number(slotIndex)] = memberId;
    if (displaced && source) next[source[0]][source[1]][source[2]] = displaced;
    apply(next);
  };
  const openScreenshot = (id, groupIndex) => setScreenshotTeam({
    name: groupNames[id] || `Team ${groupIndex + 1}`,
    guildName: guildName || 'RONW Guild', modeName: BOARD_MODES[mode].name, createdAt: new Date().toISOString(),
    parties: teams[id].map((slots, index) => ({ name: teamNames[id][index] || `Party ${index + 1}`, slots: Array.from({ length: 5 }, (_, slot) => { const member = members.find(item => item.id === slots[slot]); return member ? { ...member } : null; }) })),
  });
  return <DndContext sensors={sensors} onDragStart={event => setActive(event.active.data.current?.member)} onDragCancel={() => setActive(null)} onDragEnd={({ active: item, over }) => { updatePlacement(item.id, over?.id); setActive(null); }}>
    <div className={`planner-layout${compactView ? ' compact-view' : ''}`}><main className="builder-workspace">
      <div className="builder-heading"><div><p className="eyebrow">BATTLEFIELD PLANNER</p><h2>Your teams</h2></div><div className="builder-view-controls"><button className="user-button" aria-pressed={compactView} onClick={() => setCompactView(value => !value)}>Compact view</button><span>{assigned.size}{Number.isFinite(limit) ? `/${limit}` : ''} assigned</span></div></div>
      <form className="add-team-form" onSubmit={addTeam}><label>New team name<input value={newTeamName} onChange={event => setNewTeamName(event.target.value)} required maxLength={60} placeholder="e.g. Defense squad" disabled={!editable} /></label><button className="primary-button" disabled={!editable || !newTeamName.trim()}>+ Add team</button></form>
      {!Object.keys(teams).length && <div className="team-empty"><h3>Build your own formation</h3><p>Create a team above, then add parties and drag members into their slots.</p></div>}
      {Object.entries(teams).map(([id, parties], groupIndex) => <section className="team-group" key={id}>
        <header><div><p className="eyebrow">TEAM {groupIndex + 1}</p><NameEditor value={groupNames[id] || ''} label={`Team name ${groupIndex + 1}`} placeholder={`Team ${groupIndex + 1}`} disabled={!editable} onSave={name => apply(teams, teamNames, { ...groupNames, [id]: name })} /><small>{parties.length} parties · {parties.flat().filter(Boolean).length} players</small></div><div className="team-group-actions"><button className="user-button screenshot-team-button" disabled={!parties.length} onClick={() => openScreenshot(id, groupIndex)}>Screenshot team</button><button className="add-party" disabled={!editable || full} title={full ? `${BOARD_MODES[mode].name} party limit reached` : undefined} onClick={() => addParty(id)}>+ Add party</button><button className="remove-party" disabled={!editable} onClick={() => removeTeam(id)} aria-label={`Remove team ${groupNames[id] || groupIndex + 1}`}>Remove team</button></div></header>
        {!parties.length && <p className="team-empty-party">No parties yet. Add a party to create five player slots.</p>}
        <div className="team-parties">{parties.map((slots, partyIndex) => {
          const summary = partySummary(slots, members);
          return <article className="party-card" key={`${id}-${partyIndex}`}><header><div><NameEditor value={teamNames[id][partyIndex] || ''} label={`Party name ${groupIndex + 1} ${partyIndex + 1}`} placeholder={`Party ${partyIndex + 1}`} disabled={!editable} onSave={name => apply(teams, { ...teamNames, [id]: teamNames[id].map((current, index) => index === partyIndex ? name : current) })} /><small>{summary.count}/5 · {summary.total.toLocaleString()} GR</small></div><button className="remove-party" disabled={!editable} onClick={() => removeParty(id, partyIndex)} aria-label={`Remove party ${groupIndex + 1} ${partyIndex + 1}`}>Remove party</button></header><div className="party-slots">{slots.map((memberId, slotIndex) => <TeamSlot key={slotIndex} id={`${id}:${partyIndex}:${slotIndex}`} index={slotIndex} disabled={!editable} member={members.find(member => member.id === memberId)} />)}</div></article>;
        })}</div>
      </section>)}
    </main><aside className="member-sidebar"><div className="sidebar-header"><p className="eyebrow">ROSTER SOURCE</p><h2>Available Members</h2><span>{available.length} members</span></div><label>Search IGN<input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search player..." /></label><label>Class Filter<select value={classFilter} onChange={event => setClassFilter(event.target.value)}><option value="">All Classes</option>{classes.map(className => <option key={className} value={className}>{className}</option>)}</select></label><label>Member status<select aria-label="Member status" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="all">All statuses</option><option value="online">Online</option><option value="offline">Offline</option></select></label><p className="roster-sort-note">Highest gear score first</p><PoolDrop>{available.map(member => <DraggableMember key={member.id} member={member} disabled={!editable} />)}{!available.length && <p className="sidebar-empty">No available members found.</p>}</PoolDrop></aside></div>
    {screenshotTeam && <TeamScreenshot snapshot={screenshotTeam} onClose={() => setScreenshotTeam(null)} />}
    <DragOverlay>{active ? <MemberCard member={active} compact /> : null}</DragOverlay>
  </DndContext>;
}
function PoolDrop({ children }) { const { setNodeRef, isOver } = useDroppable({ id: 'pool' }); return <div ref={setNodeRef} className={isOver ? 'pool-drop over' : 'pool-drop'}>{children}</div>; }
function NameEditor({ value, label, placeholder, disabled, onSave }) {
  const [draft, setDraft] = useState(value); const latestValue = useRef(value); latestValue.current = value;
  useEffect(() => setDraft(value), [value]);
  const commit = async () => { const name = draft.trim(); if (name !== value && !await onSave(name)) setDraft(latestValue.current); };
  return <input className="team-name-input" aria-label={label} placeholder={placeholder} value={draft} maxLength={60} disabled={disabled} onChange={event => setDraft(event.target.value)} onBlur={commit} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} />;
}
