import test from 'node:test';
import assert from 'node:assert/strict';
import Papa from 'papaparse';
import { parseRosterCsv } from './rosterCsv.js';
import { buildRosterAnalytics } from './rosterAnalytics.js';
import { prepareRosterImport } from '../firebase/importRoster.js';

const headers = 'Id,Player,Lv.,Class,Title,Gender,Position,Gear Score,Weekly,Weekly Contribution,Total Contribution,Online Status';
const csv = records => `${headers}\n${records.join('\n')}`;
const record = ({ id, player, level = 100, className = 'Priest', title = 'Pathfinder', gear = 70000, weekly = 999, weeklyContribution = 10, total = 500, status = 'Offline' }) =>
  [id, player, level, className, title, 'F', 'Member', gear, weekly, weeklyContribution, total, status].join(',');
const load = source => parseRosterCsv(source, Papa);

test('145-record roster aggregates all cards, groups, rankings, and chart values dynamically', async () => {
  const rows = Array.from({ length: 145 }, (_, index) => record({
    id: `id-${index + 1}`, player: `Player${index + 1}`, level: 80 + index % 40,
    className: `Class${index % 14 + 1}`, title: `Title${index % 7 + 1}`,
    gear: 60000 + index * 100, weekly: 9999, weeklyContribution: index, total: index * 10,
  }));
  const { members } = await load(csv(rows));
  const result = buildRosterAnalytics(members);
  assert.equal(result.totalMembers, 145);
  assert.equal(result.classes.length, 14);
  assert.equal(result.titles.length, 7);
  assert.equal(result.weeklyContribution.total, 10440);
  assert.notEqual(result.weeklyContribution.total, 999 * 145, 'Weekly must remain separate from Weekly Contribution');
  assert.equal(result.weeklyContribution.top10[0].name, 'Player145');
  assert.equal(result.gearDistribution.bins.reduce((sum, bin) => sum + bin.count, 0), 145);
  assert.equal(result.highestGear.name, 'Player145');
  assert.equal(result.lowestGear.name, 'Player1');
});

test('CSV player IDs keep same-name records distinct and retain document identity across uploads', () => {
  const initial = prepareRosterImport([
    { sourceId: 'account-1', ign: 'Shared Name' },
    { sourceId: 'account-2', ign: 'Shared Name' },
  ], []);
  assert.equal(initial.members.length, 2);
  assert.notEqual(initial.members[0].id, initial.members[1].id);
  const next = prepareRosterImport(initial.members.map(member => ({ sourceId: member.sourceId, ign: `${member.ign} Updated` })), initial.members);
  assert.deepEqual(next.members.map(member => member.id), initial.members.map(member => member.id));
});

test('a second CSV replaces the derived distribution and exposes unseen classes and titles', async () => {
  const source = csv([
    record({ id: 'new-1', player: 'Aster', level: 20, className: 'Star Sage', title: 'Moonlit', gear: 1200, weekly: 600, weeklyContribution: 4, total: 16 }),
    record({ id: 'new-2', player: 'Beryl', level: 40, className: 'Star Sage', title: 'Moonlit', gear: 3200, weekly: 500, weeklyContribution: 15, total: 9 }),
    record({ id: 'new-3', player: 'Cinder', level: 60, className: 'Void Smith', title: 'Skybreaker', gear: 5200, weekly: 400, weeklyContribution: 7, total: 50 }),
  ]);
  const { members } = await load(source);
  const result = buildRosterAnalytics(members);
  assert.equal(result.totalMembers, 3);
  assert.deepEqual(result.classes.map(row => [row.name, row.count]), [['Star Sage', 2], ['Void Smith', 1]]);
  assert.deepEqual(result.titles.map(row => row.name), ['Moonlit', 'Skybreaker']);
  assert.equal(result.averageGearScore, 3200);
  assert.equal(result.weeklyContribution.total, 26);
  assert.equal(result.lifetimeContribution.total, 75);
  assert.equal(result.weeklyContribution.top10[0].name, 'Beryl');
  assert.notEqual(result.gearDistribution.minimum, 60000);
  assert.equal(result.gearDistribution.bins.reduce((sum, bin) => sum + bin.count, 0), 3);
});

test('missing and invalid numbers are omitted; blank player rows and invalid files are reported', async () => {
  const parsed = await load(csv([
    record({ id: 'valid', player: 'Valid', level: '', gear: 'n/a', weeklyContribution: '', total: 'bad' }),
    record({ id: 'blank', player: '', gear: 9000 }),
  ]));
  assert.equal(parsed.members.length, 1);
  assert.equal(parsed.warnings.emptyPlayerNames, 1);
  assert.equal(parsed.members[0].gearScore, null);
  assert.equal(parsed.members[0].weeklyContribution, null);
  assert.equal(parsed.members[0].totalContribution, null);
  assert.equal(buildRosterAnalytics(parsed.members).averageGearScore, null);
  await assert.rejects(load('Id,Lv.,Class\n1,50,Priest'), /Required column "Player"/);
  await assert.rejects(load(csv([record({ id: 'same', player: 'First' }), record({ id: 'same', player: 'Second' })])), /Duplicate player Id/);
});
