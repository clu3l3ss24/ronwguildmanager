export const blankTeams = () => ({ top: [], middle: [], bottom: [], flex: [] });
export const normalizeTeams = teams => Object.fromEntries(Object.keys(blankTeams()).map(lane => {
  const parties = teams?.[lane];
  if (!Array.isArray(parties) || !parties.length) return [lane, []];
  if (parties[0]?.slots) return [lane, parties.map(party => [...party.slots])];
  return [lane, Array.isArray(parties[0]) ? parties.map(party => [...party]) : [[...parties]]];
}));
// Firestore cannot store arrays directly inside other arrays.
export const serializeTeams = teams => Object.fromEntries(Object.entries(normalizeTeams(teams)).map(([lane, parties]) => [lane, parties.map(slots => ({ slots }))]));

export function formationMemberNames(teams, members, previous = {}) {
  const names = new Map(members.map(member => [member.id, member.ign]));
  return Object.fromEntries([...new Set(Object.values(teams).flat(2).filter(Boolean))].flatMap(id => {
    const name = names.get(id) || previous[id];
    return name ? [[id, name]] : [];
  }));
}

export function prepareFormation(teams, members, groupNames = {}, teamNames = {}, memberNames = {}) {
  const known = new Set(members.map(member => member.id));
  const assigned = new Set();
  let missing = 0;
  let duplicates = 0;
  const missingParties = [];
  const removedMembers = [];
  const cleaned = Object.fromEntries(Object.entries(teams || {}).map(([lane, parties], teamIndex) => [lane, parties.map((slots, partyIndex) => {
    let partyMissing = 0;
    const cleanedSlots = slots.map((id, slotIndex) => {
    if (!id) return null;
    if (!known.has(id)) {
      missing += 1; partyMissing += 1;
      removedMembers.push({ team: groupNames[lane] || `Team ${teamIndex + 1}`, party: teamNames[lane]?.[partyIndex] || `Party ${partyIndex + 1}`, slot: slotIndex + 1, name: memberNames[id] || null });
      return null;
    }
    if (assigned.has(id)) { duplicates += 1; return null; }
    assigned.add(id); return id;
    });
    if (partyMissing) missingParties.push({ team: groupNames[lane] || `Team ${teamIndex + 1}`, party: teamNames[lane]?.[partyIndex] || `Party ${partyIndex + 1}`, count: partyMissing });
    return cleanedSlots;
  })]));
  return { teams: cleaned, missing, duplicates, missingParties, removedMembers };
}

export const emptyHistory = () => ({ past: [], future: [] });
const cloneHistory = value => value?.teams ? JSON.parse(JSON.stringify(value)) : normalizeTeams(value);
export function advanceHistory(history, current, next, action = 'edit') {
  if (JSON.stringify(current) === JSON.stringify(next)) return history;
  if (action === 'undo') return { past: history.past.slice(0, -1), future: [...history.future, cloneHistory(current)].slice(-30) };
  if (action === 'redo') return { past: [...history.past, cloneHistory(current)].slice(-30), future: history.future.slice(0, -1) };
  return { past: [...history.past, cloneHistory(current)].slice(-30), future: [] };
}
