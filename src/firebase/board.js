import { roleForClass } from '../utils/classRoles.js';

export const BOARD_MODES = {
  'guild-league': { name: 'Guild League', players: 60 },
  'polarity-zone': { name: 'Polarity Zone', players: 50 },
  siege: { name: 'Siege', players: Infinity },
};
const LEGACY_LANES = ['top', 'middle', 'bottom', 'flex'];

export function normalizeBoard(value) {
  const raw = value?.teams || value || {};
  const teams = {};
  const teamNames = {};
  const groupNames = {};
  if (Array.isArray(raw.groups)) {
    for (const group of raw.groups) {
      if (!group?.id || !Array.isArray(group.parties)) continue;
      teams[group.id] = group.parties.map(party => [...party.slots]);
      teamNames[group.id] = group.parties.map(party => String(party.name || '').trim());
      groupNames[group.id] = String(group.name || '').trim();
    }
  } else {
    // Convert existing populated lanes to ordinary teams without recreating empty lanes.
    for (const [id, parties] of Object.entries(raw)) {
      if (!Array.isArray(parties)) continue;
      const slots = parties[0]?.slots ? parties.map(party => [...party.slots]) : Array.isArray(parties[0]) ? parties.map(party => [...party]) : parties.length ? [[...parties]] : [];
      if (LEGACY_LANES.includes(id) && !slots.length && !Object.hasOwn(value?.groupNames || {}, id)) continue;
      teams[id] = slots;
      teamNames[id] = slots.map((_, index) => String(value?.teamNames?.[id]?.[index] ?? parties[index]?.name ?? '').trim());
      groupNames[id] = String(value?.groupNames?.[id] || '').trim();
    }
  }
  const legacyCount = Object.values(teams).flat().length;
  const candidateMode = value?.mode || raw.mode;
  const mode = Object.hasOwn(BOARD_MODES, candidateMode) ? candidateMode : legacyCount > 12 ? 'siege' : 'guild-league';
  return { teams, mode, teamNames, groupNames };
}

export const blankBoard = (mode = 'guild-league') => normalizeBoard({ teams: {}, mode });

// Keep mode and team names inside the existing Firestore teams map.
// This uses the same guild document permissions as previous formations.
export function serializeBoard(value) {
  const board = normalizeBoard(value);
  return { mode: board.mode, schemaVersion: 2, groups: Object.keys(board.teams).map(id => ({ id, name: board.groupNames[id], parties: board.teams[id].map((slots, index) => ({ slots, name: board.teamNames[id][index] })) })) };
}

export function boardError(value) {
  const board = normalizeBoard(value);
  const parties = Object.values(board.teams).flat();
  const limit = BOARD_MODES[board.mode].players;
  if (parties.length > limit / 5) return `${BOARD_MODES[board.mode].name} allows up to ${limit} players in ${limit / 5} five-person parties.`;
  if (parties.some(slots => slots.length > 5)) return 'Each party can contain at most five players.';
  if ([...Object.values(board.teamNames).flat(), ...Object.values(board.groupNames)].some(name => name.length > 60)) return 'Team and party names must be 60 characters or fewer.';
  const assigned = parties.flat().filter(Boolean);
  if (new Set(assigned).size !== assigned.length) return 'A player can only be assigned to one team.';
  return '';
}

export function formationSaveError(value, members) {
  const board = normalizeBoard(value);
  const invalid = boardError(board);
  if (invalid) return invalid;
  const config = BOARD_MODES[board.mode];
  if (!Number.isFinite(config.players)) return '';
  const known = new Set(members.map(member => member.id));
  const parties = Object.values(board.teams).flat();
  const assigned = new Set(parties.flat().filter(id => id && known.has(id))).size;
  const full = parties.filter(slots => slots.length === 5 && slots.every(id => id && known.has(id))).length;
  const required = config.players / 5;
  if (full === required && assigned === config.players) return '';
  const remainingParties = required - full;
  const remainingPlayers = config.players - assigned;
  return `${config.name} formation is incomplete (${full}/${required} full parties, ${assigned}/${config.players} players). Add or complete the remaining ${remainingParties} ${remainingParties === 1 ? 'party' : 'parties'} and assign ${remainingPlayers} more ${remainingPlayers === 1 ? 'player' : 'players'} before saving.`;
}

export function changeBoardMode(value, mode) {
  const board = normalizeBoard(value);
  let remaining = BOARD_MODES[mode].players / 5;
  const next = blankBoard(mode);
  for (const id of Object.keys(board.teams)) {
    const count = Math.min(board.teams[id].length, remaining);
    next.teams[id] = board.teams[id].slice(0, count);
    next.teamNames[id] = board.teamNames[id].slice(0, count);
    next.groupNames[id] = board.groupNames[id];
    remaining -= count;
  }
  return next;
}

const combatRole = member => roleForClass(member?.className).toLowerCase();
const gearScore = member => Number.isFinite(Number(member.gearScore)) ? Number(member.gearScore) : 0;

export function sortMembersByGearScore(members) {
  return [...members].sort((a, b) => gearScore(b) - gearScore(a) || String(a.ign || '').localeCompare(String(b.ign || '')));
}

export function matchesMemberStatus(member, status = 'all') {
  return status === 'online' ? member.online === true : status === 'offline' ? member.online !== true : true;
}

export function autoBalanceBoard(members, value, status = 'all', preferences = null) {
  const next = normalizeBoard(value);
  const assigned = new Set(Object.values(next.teams).flat(2).filter(Boolean));
  const available = sortMembersByGearScore(members.filter(member => !assigned.has(member.id) && matchesMemberStatus(member, status)));
  const byId = new Map(members.map(member => [member.id, member]));
  let remaining = BOARD_MODES[next.mode].players - assigned.size;
  if (preferences) {
    const normalizeJob = name => String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const vacancies = Object.values(next.teams).flatMap(parties => parties.flatMap(slots => slots.flatMap((id, index) => id ? [] : [{ slots, index, preference: preferences[index] || { role: 'any', job: '' } }])));
    // Reserve scarce matches before unrestricted slots can consume them.
    vacancies.sort((a, b) => (b.preference.job ? 2 : b.preference.role !== 'any' ? 1 : 0) - (a.preference.job ? 2 : a.preference.role !== 'any' ? 1 : 0));
    for (const { slots, index, preference } of vacancies) {
      if (remaining <= 0) break;
      const candidate = available.findIndex(member => (preference.role === 'any' || combatRole(member) === preference.role) && (!preference.job || normalizeJob(member.className) === normalizeJob(preference.job)));
      if (candidate < 0) continue;
      slots[index] = available.splice(candidate, 1)[0].id;
      remaining -= 1;
    }
    return next;
  }
  for (const parties of Object.values(next.teams)) for (const slots of parties) {
    const counts = { tank: 0, healer: 0, dps: 0 };
    slots.filter(Boolean).forEach(id => { counts[combatRole(byId.get(id))] += 1; });
    for (let index = 0; index < slots.length; index += 1) {
      if (slots[index] || !available.length || remaining <= 0) continue;
      const needed = ['tank', 'healer', 'dps'].filter(role => counts[role] < (role === 'dps' ? 3 : 1));
      let candidate = -1;
      for (const role of needed) {
        candidate = available.findIndex(member => combatRole(member) === role);
        if (candidate >= 0) break;
      }
      const [member] = available.splice(candidate < 0 ? 0 : candidate, 1);
      slots[index] = member.id; counts[combatRole(member)] += 1; remaining -= 1;
    }
  }
  return next;
}
