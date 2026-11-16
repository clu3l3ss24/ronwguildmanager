const tanks = new Set(['swordsman', 'knight', 'crusader', 'lordknight', 'paladin', 'runeknight', 'royalguard']);
const healers = new Set(['acolyte', 'priest', 'highpriest', 'archbishop']);
const performers = new Set(['bard', 'clown', 'dancer', 'gypsy']);
const preferredPerformers = new Set(['bard', 'clown']);

export function roleForClass(className = '') {
  const normalized = String(className).toLowerCase().replace(/[^a-z0-9]/g, '');
  if (tanks.has(normalized)) return 'Tank';
  if (healers.has(normalized)) return 'Healer';
  if (performers.has(normalized)) return 'Performer';
  return 'DPS';
}

export const isPreferredPerformer = className => preferredPerformers.has(String(className || '').toLowerCase().replace(/[^a-z0-9]/g, ''));
