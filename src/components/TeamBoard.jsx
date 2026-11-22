import { createPortal } from 'react-dom';
﻿import { DndContext, DragOverlay, PointerSensor, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import MemberCard from './MemberCard';
import TeamSlot, { DraggableMember } from './TeamSlot';
import TeamScreenshot from './TeamScreenshot';
import '../team-screenshot.css';
import { BOARD_MODES, matchesMemberStatus, sortMembersByGearScore } from '../firebase/board';

const cloneTeams = teams => Object.fromEntries(Object.entries(teams).map(([id, parties]) => [id, parties.map(party => [...party])]));
const partySummary = (slots, members) => { const players = slots.map(id => members.find(member => member.id === id)).filter(Boolean); return { total: players.reduce((sum, member) => sum + Number(member.gearScore || 0), 0), count: players.length }; };

export default function TeamBoard({ members, teams, mode, teamNames, groupNames, statusFilter, setStatusFilter, onTeamsChange, editable, guildName, teamActionsTarget, staticOnly = false, staticParties = {}, staticPartyNames = {}, activeUsers = [], subMode = false, onToggleSub, mainTeams = {}, subTeams = {} }) {
  const [active, setActive] = useState(null);
  const [query, setQuery] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [newTeamName, setNewTeamName] = useState('');
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [fillFromStatic, setFillFromStatic] = useState(false);
  const [staticNotice, setStaticNotice] = useState('');
  const [staticDialog, setStaticDialog] = useState(null);
  const teamEntries = Object.entries(teams);
  const selectedId = Object.hasOwn(teams, selectedTeam) ? selectedTeam : teamEntries[0]?.[0];
  const selectedParties = teams[selectedId] || [];
  const selectedIndex = teamEntries.findIndex(([id]) => id === selectedId);
  const [screenshotTeam, setScreenshotTeam] = useState(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const assigned = new Set(Object.values(teams).flat(2).filter(Boolean));
  const classes = useMemo(() => [...new Set(members.map(member => member.className).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [members]);
  const mainAssigned = new Set(Object.values(mainTeams).flat(2).filter(Boolean));
  const subAssigned = new Set(Object.values(subTeams).flat(2).filter(Boolean));
  const reservedByOtherSide = subMode ? mainAssigned : subAssigned;
  const available = sortMembersByGearScore(members.filter(member => !assigned.has(member.id) && !reservedByOtherSide.has(member.id) && matchesMemberStatus(member, statusFilter) && member.ign.toLowerCase().includes(query.toLowerCase()) && (!classFilter || member.className === classFilter)));
  const limit = staticOnly ? Infinity : mode === 'guild-league' && subMode ? 90 : BOARD_MODES[mode].players;
  const full = Object.values(teams).flat().length >= limit / 5;
  const apply = (next, names = teamNames, groups = groupNames) => onTeamsChange({ teams: next, teamNames: names, groupNames: groups, mode });
  const addTeam = async event => {
    event.preventDefault();
    if (!editable || !newTeamName.trim()) return;
    const id = crypto.randomUUID();
    if (await apply({ ...teams, [id]: [] }, { ...teamNames, [id]: [] }, { ...groupNames, [id]: newTeamName.trim() })) { setNewTeamName(''); setSelectedTeam(id); }
  };
  const removeTeam = id => {
    if (!editable) return;
    if (teams[id].length && !window.confirm('Remove this team and all its parties? Assigned players will return to Available Members.')) return;
    const next = { ...teams }; const names = { ...teamNames }; const groups = { ...groupNames };
    delete next[id]; delete names[id]; delete groups[id];
    apply(next, names, groups);
  };
  const addParty = id => {
    if (!editable || full || teams[id].length >= (staticOnly ? Infinity : Math.min(18, limit / 5))) return;
    apply({ ...teams, [id]: [...teams[id], Array(5).fill(null)] }, { ...teamNames, [id]: [...teamNames[id], ''] });
  };
  const removeParty = (id, partyIndex) => {
    if (!editable) return;
    if (teams[id][partyIndex].some(Boolean) && !window.confirm('Remove this party? Assigned players will return to Available Members.')) return;
    const next = cloneTeams(teams); next[id].splice(partyIndex, 1);
    apply(next, { ...teamNames, [id]: teamNames[id].filter((_, index) => index !== partyIndex) });
  };
  const updatePlacement = async (memberId, target) => {
    if (!editable) return;
    const next = cloneTeams(teams); let source = null;
    Object.entries(next).forEach(([id, parties]) => parties.forEach((party, partyIndex) => party.forEach((idInSlot, slotIndex) => { if (idInSlot === memberId) source = [id, partyIndex, slotIndex]; })));
    if (source) next[source[0]][source[1]][source[2]] = null;
    if (!target || target === 'pool') return source ? apply(next) : undefined;
    const [id, partyIndex, slotIndex] = target.split(':');
    const party = next[id]?.[Number(partyIndex)]; if (!party) return;
    if (fillFromStatic) {
      const savedGroup = Object.entries(staticParties).find(([, parties]) => parties.some(slots => slots.includes(memberId)));
      const savedPartyIndex = savedGroup?.[1].findIndex(slots => slots.includes(memberId)) ?? -1;
      const savedParty = savedPartyIndex >= 0 ? savedGroup[1][savedPartyIndex] : null;
      if (savedParty) {
        const partySlotIndex = Number(partyIndex);
        const targetParty = next[id][partySlotIndex];
        const displaced = targetParty[Number(slotIndex)];
        targetParty[Number(slotIndex)] = memberId;
        if (displaced && source) next[source[0]][source[1]][source[2]] = displaced;
        const names = { ...teamNames, [id]: [...teamNames[id]] };
        names[id][Number(partyIndex)] = names[id][Number(partyIndex)] || staticPartyNames[savedGroup[0]]?.[savedPartyIndex] || '';
        const staticMembers = savedParty.filter(id => id && id !== memberId);
        if (!staticMembers.length) return apply(next, names);

        const fullTeams = cloneTeams(next);
        const fullNames = { ...names, [id]: [...names[id]] };
        const staticIds = savedParty.filter(staticMemberId => staticMemberId && !reservedByOtherSide.has(staticMemberId));
        const staticIdSet = new Set(staticIds);
        const targetPartyAfterMove = fullTeams[id][partySlotIndex];
        const targetOpenSlots = targetPartyAfterMove.filter(staticMemberId => !staticIdSet.has(staticMemberId) && !staticMemberId).length
          + targetPartyAfterMove.filter(staticMemberId => staticIdSet.has(staticMemberId)).length;
        const partyLimit = staticOnly ? Infinity : Math.min(18, limit / 5);
        const boardPartyCount = Object.values(fullTeams).reduce((count, parties) => count + parties.length, 0);
        const canUseNewParty = boardPartyCount < limit / 5 && fullTeams[id].length < partyLimit;
        const staticHeadcount = savedParty.filter(Boolean).length;
        const targetCanFit = staticHeadcount <= targetOpenSlots;
        let addedCount = 1;
        if (targetCanFit || canUseNewParty) {
          addedCount = 0;
          Object.values(fullTeams).forEach(parties => parties.forEach(slots => slots.forEach((assignedId, index) => {
            if (assignedId && staticIdSet.has(assignedId)) slots[index] = null;
          })));
          let destination = fullTeams[id][partySlotIndex];
          if (!targetCanFit) {
            destination = Array(5).fill(null);
            fullTeams[id].push(destination);
            fullNames[id].push(staticPartyNames[savedGroup[0]]?.[savedPartyIndex] || '');
          }
          for (const staticMemberId of staticIds) {
            const openSlot = destination.findIndex(slot => !slot);
            if (openSlot < 0) break;
            destination[openSlot] = staticMemberId;
            addedCount += 1;
          }
          if (targetCanFit) fullNames[id][partySlotIndex] = fullNames[id][partySlotIndex] || staticPartyNames[savedGroup[0]]?.[savedPartyIndex] || '';
        }
        setStaticNotice('');
        if (targetCanFit) return apply(fullTeams, fullNames);
        const success = await apply(next, names);
        if (!success) return false;
        setStaticDialog({ teams: fullTeams, names: fullNames, total: staticHeadcount, additional: staticMembers.length, addedCount });
        return true;
      }
    }
    const displaced = party[Number(slotIndex)]; party[Number(slotIndex)] = memberId;
    if (displaced && source) next[source[0]][source[1]][source[2]] = displaced;
    apply(next);
  };
  const removeMember = (memberId, slotId) => {
    if (!editable) return;
    const [id, partyIndex, slotIndex] = slotId.split(':');
    const next = cloneTeams(teams);
    if (next[id]?.[Number(partyIndex)]?.[Number(slotIndex)] !== memberId) return;
    next[id][Number(partyIndex)][Number(slotIndex)] = null;
    apply(next);
  };
  const openScreenshot = () => setScreenshotTeam({
    name: subMode ? 'SUB Roster' : 'MAIN Roster',
    guildName: guildName || 'RONW Guild', modeName: `${BOARD_MODES[mode].name}${mode === 'guild-league' ? ` ${subMode ? 'SUB' : 'MAIN'}` : ''}`, createdAt: new Date().toISOString(),
    teams: teamEntries.map(([id, parties], teamIndex) => ({
      name: groupNames[id] || `Team ${teamIndex + 1}`,
      parties: parties.map((slots, index) => ({ name: teamNames[id][index] || `Party ${index + 1}`, slots: Array.from({ length: 5 }, (_, slot) => { const member = members.find(item => item.id === slots[slot]); return member ? { ...member } : null; }) })),
    })),
  });
  return <DndContext sensors={sensors} onDragStart={event => setActive(event.active.data.current?.member)} onDragCancel={() => setActive(null)} onDragEnd={({ active: item, over }) => { updatePlacement(item.id, over?.id ?? null); setActive(null); }}>
    {teamActionsTarget && createPortal(<>{!staticOnly && <button className="user-button screenshot-team-button" disabled={!teamEntries.length} onClick={openScreenshot}>Screenshot team</button>}<button className="add-party" disabled={!editable || !selectedId || full || selectedParties.length >= (staticOnly ? Infinity : Math.min(18, limit / 5))} title={full ? `${mode === 'guild-league' && subMode ? 'Guild League SUB' : BOARD_MODES[mode].name} party limit reached` : undefined} onClick={() => addParty(selectedId)}>+ Add party</button>{!staticOnly && <button className="remove-party" disabled={!editable || !selectedId} onClick={() => removeTeam(selectedId)}>Remove team</button>}</>, teamActionsTarget)}
    {staticNotice && <p className="formation-validation" role="status">{staticNotice}</p>}
    {staticDialog && <StaticFillDialog total={staticDialog.total} additional={staticDialog.additional} addedCount={staticDialog.addedCount} onCancel={() => setStaticDialog(null)} onConfirm={async () => { const success = await apply(staticDialog.teams, staticDialog.names); if (success) setStaticDialog(null); }} />}
    <div className="planner-layout compact-view"><main className="builder-workspace">
      <div className="builder-heading"><div><p className="eyebrow">{staticOnly ? 'GUILD STATIC ROSTER' : 'BATTLEFIELD PLANNER'}</p><h2>{staticOnly ? 'Guild parties' : 'Your teams'}</h2></div><div className="builder-heading-tools">{!staticOnly && activeUsers.length > 0 && <span className="active-collaborators" title={activeUsers.join(', ')}>{activeUsers.length} active</span>}{!staticOnly && <label className="static-fill-toggle" title="When you place a member with a saved Static party, fill this party with that saved lineup."><input type="checkbox" checked={fillFromStatic} onChange={event => setFillFromStatic(event.target.checked)} disabled={!editable || !Object.values(staticParties).some(parties => parties.some(slots => slots.some(Boolean)))} /><span>Static</span></label>}<span className="team-assigned-count">{assigned.size}{Number.isFinite(limit) ? `/${limit}` : ''} assigned</span>{mode === 'guild-league' && !staticOnly && <div className={`lineup-switcher ${subMode ? 'is-sub' : 'is-main'}`}><span className="lineup-current-label">{subMode ? 'SUB LINEUP' : 'MAIN LINEUP'}</span><button className="lineup-switch-button" type="button" disabled={!editable} onClick={onToggleSub} aria-label={`Switch to ${subMode ? 'MAIN' : 'SUB'} lineup`}><span>Switch to {subMode ? 'MAIN' : 'SUB'}</span><span className="lineup-switch-arrow" aria-hidden="true">⇄</span></button></div>}</div></div>
      {!staticOnly && <form className="add-team-form" onSubmit={addTeam}><label>New team name<input value={newTeamName} onChange={event => setNewTeamName(event.target.value)} required maxLength={60} placeholder="e.g. Defense squad" disabled={!editable} /></label><button className="primary-button" disabled={!editable || !newTeamName.trim()}>+ Add team</button></form>}
      {!Object.keys(teams).length && <div className="team-empty"><h3>Build your own formation</h3><p>Create a team above, then add parties and drag members into their slots.</p></div>}
      {!staticOnly && teamEntries.length > 0 && <div className="team-tabs" role="tablist" aria-label="Teams">{teamEntries.map(([id, parties], index) => <TeamTab key={id} id={id} name={groupNames[id] || `Team ${index + 1}`} count={parties.length} maxParties={Math.min(18, limit / 5)} gearRating={partySummary(parties.flat(), members).total} selected={selectedId === id} editable={editable} onSelect={() => setSelectedTeam(id)} onRename={name => apply(teams, teamNames, { ...groupNames, [id]: name })} onNavigate={event => { let next; if (event.key === 'ArrowRight') next = (index + 1) % teamEntries.length; else if (event.key === 'ArrowLeft') next = (index - 1 + teamEntries.length) % teamEntries.length; else if (event.key === 'Home') next = 0; else if (event.key === 'End') next = teamEntries.length - 1; else return; event.preventDefault(); setSelectedTeam(teamEntries[next][0]); event.currentTarget.parentElement.children[next].focus(); }} />)}</div>}
      {teamEntries.map(([id, parties], groupIndex) => id === selectedId ? <section className="team-group" key={id} role="tabpanel" id={`team-panel-${id}`} aria-labelledby={`team-tab-${id}`}>
        {!parties.length && <p className="team-empty-party">No parties yet. Add a party to create five player slots.</p>}
        <div className="team-parties">{parties.map((slots, partyIndex) => {
          const summary = partySummary(slots, members);
          return <article className="party-card" key={`${id}-${partyIndex}`}><header><div><NameEditor value={teamNames[id][partyIndex] || ''} label={`Party name ${groupIndex + 1} ${partyIndex + 1}`} placeholder={`Party ${partyIndex + 1}`} disabled={!editable} onSave={name => apply(teams, { ...teamNames, [id]: teamNames[id].map((current, index) => index === partyIndex ? name : current) })} /><small>{summary.count}/5 · {summary.total.toLocaleString()} GR</small></div><button className="remove-party" disabled={!editable} onClick={() => removeParty(id, partyIndex)} aria-label={`Remove party ${groupIndex + 1} ${partyIndex + 1}`}>Remove party</button></header><div className="party-slots">{slots.map((memberId, slotIndex) => { const slotId = `${id}:${partyIndex}:${slotIndex}`; return <TeamSlot key={slotIndex} id={slotId} index={slotIndex} disabled={!editable} member={members.find(member => member.id === memberId)} onRemove={member => removeMember(member.id, slotId)} />; })}</div></article>;
        })}</div>
      </section> : null)}
    </main><aside className="member-sidebar"><div className="sidebar-header"><p className="eyebrow">ROSTER SOURCE</p><h2>Available Members</h2><span>{available.length} members</span></div><label>Search IGN<input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search player..." /></label><label>Class Filter<select value={classFilter} onChange={event => setClassFilter(event.target.value)}><option value="">All Classes</option>{classes.map(className => <option key={className} value={className}>{className}</option>)}</select></label><label>Member status<select aria-label="Member status" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="all">All statuses</option><option value="online">Online</option><option value="offline">Offline</option></select></label><p className="roster-sort-note">Highest gear score first</p><PoolDrop>{available.map(member => <DraggableMember key={member.id} member={member} disabled={!editable} />)}{!available.length && <p className="sidebar-empty">No available members found.</p>}</PoolDrop></aside></div>
    {!staticOnly && screenshotTeam && <TeamScreenshot snapshot={screenshotTeam} onClose={() => setScreenshotTeam(null)} />}
    <DragOverlay>{active ? <MemberCard member={active} compact /> : null}</DragOverlay>
  </DndContext>;
}
function PoolDrop({ children }) { const { setNodeRef, isOver } = useDroppable({ id: 'pool' }); return <div ref={setNodeRef} className={isOver ? 'pool-drop over' : 'pool-drop'}>{children}</div>; }
function StaticFillDialog({ total, additional, addedCount, onCancel, onConfirm }) {
  const dialog = useRef(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { element.close(); document.body.style.overflow = previous; };
  }, []);
  const confirm = async () => { setSaving(true); try { await onConfirm(); } finally { setSaving(false); } };
  return <dialog ref={dialog} className="formation-dialog static-fill-dialog" aria-labelledby="static-fill-title" onCancel={event => { event.preventDefault(); if (!saving) onCancel(); }}>
    <header className="formation-dialog-heading"><div><p className="eyebrow">STATIC PARTY</p><h2 id="static-fill-title">Use the entire static?</h2></div><span className="static-hc-badge">{total} HC</span></header>
    <p className="formation-dialog-description">This member belongs to a static with {total} HC ({additional} more). The member you placed is already in the party.</p>
    <p className="formation-dialog-description">Add the rest of the static to open slots? If the current party runs out of room, a new party will be created.</p>
    {addedCount < total && <p className="formation-validation" role="status">Only {addedCount} of {total} HC can be added within this battle mode's limits or current assignments.</p>}
    <footer className="formation-dialog-footer"><button type="button" className="user-button" disabled={saving} onClick={onCancel}>Just this member</button><button type="button" className="primary-button" disabled={saving} onClick={confirm}>{saving ? 'Adding static…' : 'Use entire static'}</button></footer>
  </dialog>;
}
function NameEditor({ value, label, placeholder, disabled, onSave }) {
  const [draft, setDraft] = useState(value); const latestValue = useRef(value); latestValue.current = value;
  useEffect(() => setDraft(value), [value]);
  const commit = async () => { const name = draft.trim(); if (name !== value && !await onSave(name)) setDraft(latestValue.current); };
  return <input className="team-name-input" aria-label={label} placeholder={placeholder} value={draft} maxLength={60} disabled={disabled} onChange={event => setDraft(event.target.value)} onBlur={commit} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} />;
}

function TeamTab({ id, name, count, maxParties = 8, gearRating, selected, editable, onSelect, onRename, onNavigate }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [saving, setSaving] = useState(false);
  const editingRef = useRef(false);
  const begin = () => { if (!editable) return; onSelect(); setDraft(name); editingRef.current = true; setEditing(true); };
  const commit = async () => {
    if (!editingRef.current) return;
    editingRef.current = false;
    const trimmed = draft.trim();
    if (!trimmed || trimmed === name) { setEditing(false); return; }
    setSaving(true);
    try { if (await onRename(trimmed)) setEditing(false); else editingRef.current = true; }
    finally { setSaving(false); }
  };
  if (editing) return <input className="team-tab-editor" aria-label="Rename team" value={draft} maxLength={60} autoFocus disabled={saving || !editable} onFocus={event => event.target.select()} onChange={event => setDraft(event.target.value)} onBlur={commit} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } else if (event.key === 'Escape') { event.preventDefault(); editingRef.current = false; setEditing(false); } }} />;
  return <button type="button" role="tab" id={`team-tab-${id}`} aria-selected={selected} aria-controls={`team-panel-${id}`} tabIndex={selected ? 0 : -1} title={`${name}: ${gearRating.toLocaleString()} GR${editable ? ' · Double-click or press F2 to rename' : ''}`} onClick={onSelect} onDoubleClick={begin} onKeyDown={event => { if (event.key === 'F2' && editable) { event.preventDefault(); begin(); } else onNavigate(event); }}><span className="team-tab-name">{name}</span><span className="team-tab-summary">{count}/{maxParties} · {gearRating.toLocaleString()} GR</span></button>;
}
