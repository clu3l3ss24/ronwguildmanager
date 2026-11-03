import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceHistory, blankTeams, emptyHistory, formationMemberNames, normalizeTeams, prepareFormation, serializeTeams } from './teams.js';

test('empty boards stay empty when reloaded', () => {
  assert.deepEqual(normalizeTeams(blankTeams()), blankTeams());
});
test('manual parties round trip through Firestore-compatible objects', () => {
  const teams = { ...blankTeams(), top: [['player-a', null, 'player-b', null, null], [null, 'player-c', null, null, null]] };
  const encoded = serializeTeams(teams);
  assert.deepEqual(encoded.top[0], { slots: teams.top[0] });
  assert.deepEqual(normalizeTeams(JSON.parse(JSON.stringify(encoded))), teams);
  assert.equal(teams.top[0][0], 'player-a');
});
test('legacy single-party lane saves retain their assignments', () => {
  assert.deepEqual(normalizeTeams({ top: ['player-a', null] }), { ...blankTeams(), top: [['player-a', null]] });
});
test('normalization returns independent party arrays', () => {
  const original = { ...blankTeams(), top: [['player-a']] };
  const restored = normalizeTeams(original);
  restored.top[0][0] = 'player-b';
  assert.equal(original.top[0][0], 'player-a');
});

test('loading clears departed players and duplicate assignments without changing the saved setup', () => {
  const original = { ...blankTeams(), top: [['player-a', 'missing', 'player-a', null, 'player-b']] };
  const loaded = prepareFormation(original, [{ id: 'player-a' }, { id: 'player-b' }]);
  assert.deepEqual(loaded, { teams: { ...blankTeams(), top: [['player-a', null, null, null, 'player-b']] }, missing: 1, duplicates: 1, missingParties: [{ team: 'Team 1', party: 'Party 1', count: 1 }], removedMembers: [{ team: 'Team 1', party: 'Party 1', slot: 2, name: null }] });
  assert.equal(original.top[0][1], 'missing');
});

test('roster reconciliation reports each affected custom party and preserves exact slot positions', () => {
  const original = { alpha: [['retained', 'departed-a', null, 'departed-b', null], [null, null, null, null, null]], beta: [['departed-c', null, null, null, null]] };
  const loaded = prepareFormation(original, [{ id: 'retained' }], { alpha: 'Frontline', beta: 'Team 2' }, { alpha: ['Attack', 'Reserve'], beta: ['Party 1'] });
  assert.deepEqual(loaded.missingParties, [{ team: 'Frontline', party: 'Attack', count: 2 }, { team: 'Team 2', party: 'Party 1', count: 1 }]);
  assert.deepEqual(loaded.teams.alpha[0], ['retained', null, null, null, null]);
  assert.equal(loaded.missing, 3);
  assert.equal(original.alpha[0][1], 'departed-a');
  assert.deepEqual(prepareFormation(loaded.teams, [{ id: 'retained' }]).missingParties, []);
});

test('saved names identify departed members after serialization and roster replacement', () => {
  const teams = { defense: [['keep', 'gone', null, null, null]] };
  const memberNames = JSON.parse(JSON.stringify(formationMemberNames(teams, [{ id: 'keep', ign: 'StillHere' }, { id: 'gone', ign: 'FormerPlayer' }])));
  const result = prepareFormation(teams, [{ id: 'keep', ign: 'StillHere' }], { defense: 'Defense' }, { defense: ['Guardians'] }, memberNames);
  assert.deepEqual(result.removedMembers, [{ team: 'Defense', party: 'Guardians', slot: 2, name: 'FormerPlayer' }]);
  assert.deepEqual(formationMemberNames(teams, [{ id: 'keep', ign: 'RenamedPlayer' }], memberNames), { keep: 'RenamedPlayer', gone: 'FormerPlayer' });
  assert.deepEqual(result.teams.defense[0], ['keep', null, null, null, null]);
});

test('undo and redo restore whole changes and a new edit discards redo', () => {
  const a = blankTeams();
  const b = { ...blankTeams(), top: [['player-a']] };
  const c = { ...blankTeams(), bottom: [['player-b']] };
  let history = advanceHistory(emptyHistory(), a, b);
  history = advanceHistory(history, b, c);
  assert.deepEqual(history.past.at(-1), b);
  history = advanceHistory(history, c, b, 'undo');
  assert.deepEqual(history.future.at(-1), c);
  history = advanceHistory(history, b, c, 'redo');
  assert.equal(history.future.length, 0);
  history = advanceHistory(history, c, b, 'undo');
  history = advanceHistory(history, b, a);
  assert.equal(history.future.length, 0);
});

test('history is capped at 30 independent states and ignores no-op edits', () => {
  let history = emptyHistory();
  let current = blankTeams();
  for (let index = 0; index < 40; index += 1) {
    const next = { ...blankTeams(), top: [[`player-${index}`]] };
    history = advanceHistory(history, current, next);
    current = next;
  }
  assert.equal(history.past.length, 30);
  assert.equal(advanceHistory(history, current, current), history);
  current.top[0][0] = 'changed';
  assert.notEqual(history.past.at(-1).top[0][0], 'changed');
});
