import basic from '../assets/jobs/jobs-basic.png';
import advanced from '../assets/jobs/jobs-advanced.png';
import transcendent from '../assets/jobs/jobs-transcendent.png';
import third from '../assets/jobs/jobs-third.png';
import referenceJobs from '../assets/jobs/job-reference-sheet.png';

const normalize = name => String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const icons = new Map();
export const JOB_NAMES = [];
const register = (source, x, names) => names.forEach((name, index) => {
  icons.set(normalize(name), { source, x, y: 12 + index * 61 });
  JOB_NAMES.push(name);
});

// Crop the icon tiles from the supplied class reference screenshots with CSS.
register(basic, 15, ['Swordsman', 'Mage', 'Archer', 'Acolyte', 'Thief', 'Merchant', 'Gunslinger', 'Knight', 'Crusader', 'Wizard', 'Sage', 'Hunter', 'Bard', 'Dancer', 'Priest']);
register(advanced, 17, ['Monk', 'Assassin', 'Rogue', 'Blacksmith', 'Alchemist', 'Rebel', 'Lord Knight', 'Paladin', 'High Wizard', 'Scholar', 'Sniper', 'Clown', 'Gypsy', 'High Priest', 'Champion']);
register(transcendent, 20, ['Assassin Cross', 'Stalker', 'Whitesmith', 'Creator', 'Night Watch', 'Rune Knight', 'Royal Guard', 'Warlock', 'Sorcerer']);
register(third, 16, ['Ranger', 'Minstrel', 'Wanderer', 'Arch Bishop', 'Sura', 'Guillotine Cross', 'Shadow Chaser', 'Mechanic', 'Genetic']);
const referenceNames = [
  ['Swordsman', 'Knight', 'Lord Knight', 'Crusader', 'Paladin', 'Mage', 'Wizard', 'High Wizard'],
  ['Sage', 'Scholar', 'Archer', 'Hunter', 'Sniper', 'Bard', 'Clown', 'Dancer'],
  ['Gypsy', 'Acolyte', 'Priest', 'High Priest', 'Monk', 'Champion', 'Thief', 'Assassin'],
  ['Assassin Cross', 'Rogue', 'Stalker', 'Merchant', 'Blacksmith', 'Whitesmith', 'Alchemist', 'Creator'],
  ['Gunslinger', 'Rebel', 'Night Watch', 'Druid', 'Kanos', 'Alithea'],
];
referenceNames.forEach((row, rowIndex) => row.forEach((name, columnIndex) => {
  const iconName = normalize(name);
  icons.set(iconName, { source: referenceJobs, x: 41 + columnIndex * 120, y: 15 + rowIndex * 90, width: 44, height: 44 });
  if (!JOB_NAMES.some(existing => normalize(existing) === iconName)) JOB_NAMES.push(name);
}));

export const getJobIcon = className => icons.get(normalize(className)) || null;

export default function JobIcon({ className }) {
  const icon = getJobIcon(className);
  return <span className={`job-icon${icon ? '' : ' job-icon-unknown'}`} aria-hidden="true">
    {icon ? <span style={{ backgroundImage: `url("${icon.source}")`, backgroundPosition: `-${icon.x}px -${icon.y}px` }} /> : '?'}
  </span>;
}
