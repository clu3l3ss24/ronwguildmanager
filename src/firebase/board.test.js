import test from 'node:test';
import assert from 'node:assert/strict';
import { autoBalanceBoard, blankBoard, boardError, changeBoardMode, formationSaveError, normalizeBoard, serializeBoard, sortMembersByGearScore } from './board.js';
import { advanceHistory, emptyHistory } from './teams.js';
import { roleForClass } from '../utils/classRoles.js';

test('guild class roles use the exact tank and healer lists; all remaining classes are DPS', () => {
  for (const job of ['Swordsman', 'Knight', 'Crusader', 'Lord Knight', 'Paladin', 'Rune Knight', 'Royal Guard']) assert.equal(roleForClass(job), 'Tank', job);
  for (const job of ['Acolyte', 'Priest', 'High Priest', 'Arch Bishop']) assert.equal(roleForClass(job), 'Healer', job);
  for (const job of ['Mage', 'Scholar', 'Sura', 'Bard', 'Dancer', 'Night Watch', 'Dragon Knight', 'Support', 'Healer', 'Tank', '', undefined]) assert.equal(roleForClass(job), 'DPS', job);
  assert.equal(roleForClass(' ARCHbishop '), 'Healer');
  assert.equal(roleForClass('royal-guard'), 'Tank');
});

test('auto-balance fills tank and healer needs using the shared class mapping', () => {
  for (const tank of ['Swordsman', 'Crusader', 'Paladin', 'Royal Guard']) {
    const members = ['Mage', 'Bard', 'Dancer', tank, 'Acolyte'].map((className, index) => ({ id: String(index), className, gearScore: 100 - index }));
    const result = autoBalanceBoard(members, { mode: 'siege', teams: { alpha: [[null, null, null, null, null]] } });
    assert.deepEqual(result.teams.alpha[0], ['3', '4', '0', '1', '2']);
  }
});

const roster = Array.from({ length: 73 }, (_, index) => ({ id: `player-${index}`, ign: `Player ${index}`, gearScore: 10000 - index, className: ['Knight', 'Priest', 'Wizard'][index % 3] }));
const customBoard = (mode, count = 0) => { const board = normalizeBoard({ mode, teams: { defense: [], attack: [] }, groupNames: { defense: 'Defense', attack: 'Attack' } }); for (let index = 0; index < count; index += 1) { const id = index % 2 ? 'attack' : 'defense'; board.teams[id].push(Array(5).fill(null)); board.teamNames[id].push(''); } return board; };
const players = board => Object.values(board.teams).flat(2).filter(Boolean);
const parties = board => Object.values(board.teams).flat().length;

test('preferred autofill reserves specific jobs before Any and uses highest matching gear score', () => {
  const members = [
    { id: 'guard-low', className: 'Royal Guard', gearScore: 100, online: true },
    { id: 'guard-high', className: 'Royal Guard', gearScore: 500, online: true },
    { id: 'priest', className: 'Priest', gearScore: 400, online: true },
    { id: 'mage', className: 'Mage', gearScore: 300, online: true },
    { id: 'offline', className: 'Royal Guard', gearScore: 999, online: false },
  ];
  const original = { mode: 'siege', teams: { alpha: [[null, null, null, 'mage', null]] } };
  const prefs = [{ role: 'any', job: '' }, { role: 'tank', job: 'royalguard' }, { role: 'healer', job: '' }, { role: 'tank', job: '' }, { role: 'dps', job: 'Ranger' }];
  const result = autoBalanceBoard(members, original, 'online', prefs);
  assert.deepEqual(result.teams.alpha[0], ['guard-low', 'guard-high', 'priest', 'mage', null]);
  assert.equal(original.teams.alpha[0][0], null);
});

test('Any preference uses highest gear score across roles and fills multiple existing parties only once', () => {
  const members = Array.from({ length: 7 }, (_, i) => ({ id: String(i), className: i === 0 ? 'Mage' : 'Knight', gearScore: 100 - i }));
  const prefs = Array.from({ length: 5 }, () => ({ role: 'any', job: '' }));
  const result = autoBalanceBoard(members, { mode: 'siege', teams: { alpha: [Array(5).fill(null), Array(5).fill(null)] } }, 'all', prefs);
  assert.deepEqual(result.teams.alpha, [['0', '1', '2', '3', '4'], ['5', '6', null, null, null]]);
});

test('auto-balance respects event limits and assigns each player only once', () => {
  for (const [mode, count, teamCount] of [['guild-league', 60, 12], ['polarity-zone', 50, 10], ['siege', 73, 15]]) {
    const result = autoBalanceBoard(roster, customBoard(mode, teamCount));
    assert.equal(players(result).length, count);
    assert.equal(new Set(players(result)).size, count);
    assert.equal(parties(result), teamCount);
    assert.equal(boardError(result), '');
  }
});
test('board validation rejects manual teams beyond the selected event capacity', () => {
  const large = autoBalanceBoard(roster, customBoard('siege', 15));
  assert.match(boardError({ ...large, mode: 'guild-league' }), /60 players/);
  assert.match(boardError({ ...large, mode: 'polarity-zone' }), /50 players/);
  assert.equal(boardError(large), '');
});
test('team names and mode survive Firestore serialization and a saved formation round trip', () => {
  const original = autoBalanceBoard(roster, customBoard('polarity-zone', 10));
  original.teamNames.defense[0] = 'Castle Guard';
  original.teamNames.attack[0] = 'Quick Response';
  assert.deepEqual(normalizeBoard(JSON.parse(JSON.stringify(serializeBoard(original)))), original);
  assert.deepEqual(normalizeBoard({ name: 'Defense', ...original }), original);
});
test('lower capacity modes retain names on remaining teams and return excess players to the pool', () => {
  const original = autoBalanceBoard(roster, customBoard('guild-league', 12));
  original.teamNames.defense[0] = 'Frontline';
  const smaller = changeBoardMode(original, 'polarity-zone');
  assert.equal(players(smaller).length, 50);
  assert.equal(parties(smaller), 10);
  assert.equal(smaller.teamNames.defense[0], 'Frontline');
  assert.equal(players(original).length, 60);
  const larger = changeBoardMode(smaller, 'siege');
  assert.equal(players(larger).length, 50);
});
test('legacy saved formations keep assignments and default safely to an appropriate mode', () => {
  const old = { top: [['player-1', null, null, null, null]], middle: [], bottom: [], flex: [] };
  const loaded = normalizeBoard(old);
  assert.equal(loaded.mode, 'guild-league');
  assert.deepEqual(loaded.teams, { top: old.top });
  assert.deepEqual(loaded.teamNames.top, ['']);
  assert.equal(normalizeBoard({ ...old, top: Array.from({ length: 13 }, () => Array(5).fill(null)) }).mode, 'siege');
});
test('undo and redo retain mode changes and custom names independently', () => {
  const initial = autoBalanceBoard(roster, customBoard('guild-league', 12));
  initial.teamNames.defense[0] = 'Frontline';
  const changed = changeBoardMode(initial, 'polarity-zone');
  let history = advanceHistory(emptyHistory(), initial, changed);
  assert.deepEqual(history.past.at(-1), initial);
  history = advanceHistory(history, changed, initial, 'undo');
  assert.deepEqual(history.future.at(-1), changed);
  initial.teamNames.defense[0] = 'Changed later';
  assert.equal(history.future.at(-1).teamNames.defense[0], 'Frontline');
});

test('new boards have no predefined teams and auto-balance does not create them', () => {
  assert.deepEqual(blankBoard().teams, {});
  assert.deepEqual(autoBalanceBoard(roster, blankBoard()).teams, {});
});
test('empty named teams and their custom hierarchy survive save and reload', () => {
  const board = customBoard('siege');
  board.teams.defense = [Array(5).fill(null), ['player-1', null, null, null, null]];
  board.teamNames.defense = ['Guard party', 'Reserve party'];
  const restored = normalizeBoard(JSON.parse(JSON.stringify(serializeBoard(board))));
  assert.deepEqual(restored, normalizeBoard(board));
  assert.equal(restored.groupNames.defense, 'Defense');
  assert.deepEqual(restored.teams.attack, []);
});
test('mode changes preserve user-created teams even when their parties are trimmed', () => {
  const board = autoBalanceBoard(roster, customBoard('siege', 15));
  const trimmed = changeBoardMode(board, 'polarity-zone');
  assert.deepEqual(Object.keys(trimmed.teams), ['defense', 'attack']);
  assert.deepEqual(trimmed.groupNames, board.groupNames);
  assert.equal(parties(trimmed), 10);
});
test('auto-balance preserves user-created parties, names, and asymmetric team sizes', () => {
  const board = customBoard('siege');
  board.teams.defense = Array.from({ length: 3 }, () => Array(5).fill(null));
  board.teamNames.defense = ['Frontline', 'Support', 'Reserve'];
  board.teams.attack = [Array(5).fill(null)];
  board.teamNames.attack = ['Strike party'];
  const balanced = autoBalanceBoard(roster.slice(0, 10), board);
  assert.equal(balanced.teams.defense.length, 3);
  assert.equal(balanced.teams.attack.length, 1);
  assert.deepEqual(balanced.teamNames, board.teamNames);
  assert.equal(players(balanced).length, 10);
});

test('auto-balance never creates parties even with a large unassigned roster', () => {
  const board = customBoard('siege', 1);
  const result = autoBalanceBoard(roster, board);
  assert.equal(parties(result), 1);
  assert.equal(players(result).length, 5);
  assert.deepEqual(autoBalanceBoard(roster, customBoard('siege')), customBoard('siege'));
});
test('auto-fill preserves every assigned slot and fills missing roles from unassigned players', () => {
  const board = customBoard('guild-league', 2);
  board.teams.defense[0][0] = 'player-72';
  board.teams.attack[0] = ['player-60', 'player-61', 'player-62', 'player-63', 'player-64'];
  board.teamNames.defense[0] = 'Guard';
  const result = autoBalanceBoard(roster, board);
  assert.deepEqual(result.teams.defense[0], ['player-72', 'player-1', 'player-2', 'player-5', 'player-8']);
  assert.deepEqual(result.teams.attack[0], board.teams.attack[0]);
  assert.equal(new Set(players(result)).size, 10);
  assert.deepEqual(result.teamNames, board.teamNames);
  assert.equal(board.teams.defense[0][1], null);
  assert.deepEqual(autoBalanceBoard(roster, result), result);
});
test('auto-fill leaves empty slots when available members run out', () => {
  const result = autoBalanceBoard(roster.slice(0, 2), customBoard('siege', 3));
  assert.equal(parties(result), 3);
  assert.equal(players(result).length, 2);
  assert.equal(Object.values(result.teams).flat(2).filter(id => !id).length, 13);
});
test('roster sorting is descending by numeric gear score and never mutates source data', () => {
  const input = [{ ign: 'Low', gearScore: 100 }, { ign: 'High', gearScore: '900' }, { ign: 'Missing' }, { ign: 'Middle', gearScore: 500 }];
  assert.deepEqual(sortMembersByGearScore(input).map(member => member.ign), ['High', 'Middle', 'Low', 'Missing']);
  assert.equal(input[0].ign, 'Low');
});

test('online auto-fill excludes offline candidates while preserving assigned offline members', () => {
  const members = roster.slice(0, 8).map((member, index) => ({ ...member, online: index % 2 === 0 }));
  const board = customBoard('guild-league', 1);
  board.teams.defense[0][0] = members[1].id;
  const result = autoBalanceBoard(members, board, 'online');
  assert.equal(result.teams.defense[0][0], members[1].id);
  assert.equal(players(result).length, 5);
  for (const id of players(result).slice(1)) assert.equal(members.find(member => member.id === id).online, true);
  assert.equal(parties(result), 1);
});

test('offline auto-fill uses only offline members and all statuses remains the default', () => {
  const members = roster.slice(0, 8).map((member, index) => ({ ...member, online: index % 2 === 0 }));
  const board = customBoard('guild-league', 1);
  const offline = autoBalanceBoard(members, board, 'offline');
  assert.equal(players(offline).length, 4);
  for (const id of players(offline)) assert.equal(members.find(member => member.id === id).online, false);
  assert.deepEqual(autoBalanceBoard(members, board), autoBalanceBoard(members, board, 'all'));
  assert.equal(players(autoBalanceBoard(members, board)).length, 5);
  assert.deepEqual(autoBalanceBoard(members.filter(member => member.online), board, 'offline'), board);
});

test('Guild League and Polarity Zone reject empty and partial named saves with remaining counts', () => {
  for (const [mode, count, teamCount] of [['guild-league', 60, 12], ['polarity-zone', 50, 10]]) {
    assert.match(formationSaveError(blankBoard(mode), roster), new RegExp(`0/${teamCount} full parties, 0/${count} players`));
    const complete = autoBalanceBoard(roster, customBoard(mode, teamCount));
    assert.equal(formationSaveError(complete, roster), '');
    complete.teams.defense[0][0] = null;
    const error = formationSaveError(complete, roster);
    assert.match(error, /remaining 1 party/);
    assert.match(error, /assign 1 more player/);
  }
});

test('Siege saves remain flexible and departed players cannot satisfy a complete event save', () => {
  assert.equal(formationSaveError(blankBoard('siege'), roster), '');
  const partial = customBoard('siege', 1);
  partial.teams.defense[0][0] = roster[0].id;
  assert.equal(formationSaveError(partial, roster), '');
  const full = autoBalanceBoard(roster, customBoard('guild-league', 12));
  const removedId = full.teams.defense[0][0];
  assert.match(formationSaveError(full, roster.filter(member => member.id !== removedId)), /assign 1 more player/);
});
