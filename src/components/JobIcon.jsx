import basic from '../assets/jobs/jobs-basic.png';
import advanced from '../assets/jobs/jobs-advanced.png';
import transcendent from '../assets/jobs/jobs-transcendent.png';
import third from '../assets/jobs/jobs-third.png';

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

export const getJobIcon = className => icons.get(normalize(className)) || null;

export default function JobIcon({ className }) {
  const icon = getJobIcon(className);
  return <span className={`job-icon${icon ? '' : ' job-icon-unknown'}`} aria-hidden="true">
    {icon ? <span style={{ backgroundImage: `url("${icon.source}")`, backgroundPosition: `-${icon.x}px -${icon.y}px` }} /> : '?'}
  </span>;
}
