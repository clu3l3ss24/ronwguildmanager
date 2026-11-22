const HEADER_ALIASES = {
  id: ['id', 'playerid', 'memberid'],
  player: ['player', 'playername', 'playernameign', 'ign'],
  level: ['lv', 'level'],
  className: ['class'],
  title: ['title'],
  gender: ['gender'],
  position: ['position', 'guildposition'],
  gearScore: ['gearscore'],
  weekly: ['weekly'],
  weeklyContribution: ['weeklycontribution'],
  totalContribution: ['totalcontribution', 'lifetimecontribution'],
  onlineStatus: ['onlinestatus', 'status'],
};

const normalizeHeader = header => String(header ?? '').replace(/^\uFEFF/, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const headerMap = new Map(Object.entries(HEADER_ALIASES).flatMap(([field, aliases]) => aliases.map(alias => [alias, field])));

export class RosterCsvValidationError extends Error {
  constructor(message) { super(message); this.name = 'RosterCsvValidationError'; this.code = 'csv/invalid'; }
}

function numeric(value, field, warnings) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const cleaned = raw.replace(/,/g, '');
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(cleaned)) {
    warnings.invalidNumericFields[field] = (warnings.invalidNumericFields[field] || 0) + 1;
    return null;
  }
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed) || parsed < 0) {
    warnings.invalidNumericFields[field] = (warnings.invalidNumericFields[field] || 0) + 1;
    return null;
  }
  return parsed;
}

function parseOnlineStatus(value) {
  const status = String(value ?? '').trim();
  const offline = /\boffline\b/i.test(status);
  if (!offline) return { online: /\bonline\b/i.test(status), offlineDays: null };
  const dayMatch = status.match(/(?:offline\D{0,24}(\d+(?:\.\d+)?)\s*(?:d|days?)\b|(\d+(?:\.\d+)?)\s*(?:d|days?)\D{0,24}offline)/i);
  const offlineDays = dayMatch ? Number(dayMatch[1] || dayMatch[2]) : null;
  return { online: false, offlineDays: Number.isFinite(offlineDays) ? offlineDays : null };
}

export function mapRosterCsvRows(rows, headers) {
  if (!Array.isArray(headers) || headers.length === 0) throw new RosterCsvValidationError('The CSV has no column headers.');
  const fields = headers.map(header => headerMap.get(normalizeHeader(header)) || null);
  const headerFields = new Set();
  for (const field of fields) {
    if (field && headerFields.has(field)) throw new RosterCsvValidationError(`The CSV contains more than one column for "${field}". Keep one matching column and retry.`);
    if (field) headerFields.add(field);
  }
  const playerIndex = fields.indexOf('player');
  if (playerIndex < 0) throw new RosterCsvValidationError('Required column "Player" is missing. Keep the current roster and add a Player column before retrying.');
  const fieldIndexes = new Map();
  fields.forEach((field, index) => { if (field && !fieldIndexes.has(field)) fieldIndexes.set(field, index); });
  const index = field => fieldIndexes.get(field);
  const warnings = { emptyPlayerNames: 0, invalidNumericFields: {} };
  const seenIds = new Set();
  const members = [];

  for (const row of rows) {
    const cells = Array.isArray(row) ? row : [];
    if (cells.slice(headers.length).some(cell => String(cell ?? '').trim())) throw new RosterCsvValidationError('A row contains more values than the CSV headers. The current roster was not changed.');
    const read = field => { const cellIndex = index(field); return cellIndex === undefined ? '' : String(cells[cellIndex] ?? '').trim(); };
    const sourceId = read('id');
    if (sourceId) {
      if (seenIds.has(sourceId)) throw new RosterCsvValidationError(`Duplicate player Id "${sourceId}" was found. Remove duplicate IDs and retry; the current roster was not changed.`);
      seenIds.add(sourceId);
    }
    const ign = read('player');
    if (!ign) { warnings.emptyPlayerNames += 1; continue; }
    const level = numeric(read('level'), 'Lv.', warnings);
    const gearScore = numeric(read('gearScore'), 'Gear Score', warnings);
    const weekly = numeric(read('weekly'), 'Weekly', warnings);
    const weeklyContribution = numeric(read('weeklyContribution'), 'Weekly Contribution', warnings);
    const totalContribution = numeric(read('totalContribution'), 'Total Contribution', warnings);
    const onlineStatus = parseOnlineStatus(read('onlineStatus'));
    members.push({
      sourceId, ign, level, className: read('className'), title: read('title'), gender: read('gender'), guildPosition: read('position'),
      gearScore, weekly, weeklyContribution, totalContribution,
      ...onlineStatus,
    });
  }
  if (!members.length) throw new RosterCsvValidationError('No valid player rows were found. Add a non-empty Player value and retry; the current roster was not changed.');
  return { members, warnings };
}

export function parseRosterCsv(file, Papa) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: false,
      skipEmptyLines: 'greedy',
      complete: ({ data, errors }) => {
        if (errors.length) {
          reject(new RosterCsvValidationError(`CSV format error: ${errors[0].message}. The current roster was not changed.`));
          return;
        }
        try {
          const [headers = [], ...rows] = data;
          resolve(mapRosterCsvRows(rows, headers));
        } catch (error) { reject(error); }
      },
      error: error => reject(new RosterCsvValidationError(`Could not read the CSV: ${error.message}. The current roster was not changed.`)),
    });
  });
}
