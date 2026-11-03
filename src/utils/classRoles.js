const tanks = new Set(['swordsman', 'knight', 'crusader', 'lordknight', 'paladin', 'runeknight', 'royalguard']);
const healers = new Set(['acolyte', 'priest', 'highpriest', 'archbishop']);

export function roleForClass(className = '') {
  const normalized = String(className).toLowerCase().replace(/[^a-z0-9]/g, '');
  if (tanks.has(normalized)) return 'Tank';
  if (healers.has(normalized)) return 'Healer';
  return 'DPS';
}
