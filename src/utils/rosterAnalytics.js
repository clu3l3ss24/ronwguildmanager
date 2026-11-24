const numeric = value => {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const cleaned = String(value).replace(/,/g, '').trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(cleaned)) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const byDescending = (key, a, b) => b[key] - a[key] || a.name.localeCompare(b.name);

function distribution(values) {
  if (!values.length) return { bins: [], minimum: null, maximum: null, maximumCount: 0 };
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const count = values.length < 2 ? 1 : Math.min(12, Math.max(4, Math.ceil(Math.log2(values.length) + 1)));
  const width = maximum === minimum ? 1 : (maximum - minimum) / count;
  const bins = Array.from({ length: count }, (_, index) => ({
    start: minimum + width * index,
    end: index === count - 1 ? maximum : minimum + width * (index + 1),
    count: 0,
  }));
  values.forEach(value => {
    const binIndex = maximum === minimum ? 0 : Math.min(count - 1, Math.floor((value - minimum) / width));
    bins[binIndex].count += 1;
  });
  return { bins, minimum, maximum, maximumCount: Math.max(...bins.map(bin => bin.count)) };
}

export function buildRosterAnalytics(members) {
  const classes = new Map();
  const titles = new Map();
  const levels = [];
  const gear = [];
  const weekly = [];
  const lifetime = [];
  const gearMembers = [];
  const inactive = [];
  let highestGear = null;
  let lowestGear = null;

  for (const member of members) {
    const className = String(member.className || '').trim() || 'Unspecified';
    let classRow = classes.get(className);
    if (!classRow) { classRow = { name: className, count: 0, gearScores: [] }; classes.set(className, classRow); }
    classRow.count += 1;

    const title = String(member.title || '').trim();
    if (title) titles.set(title, (titles.get(title) || 0) + 1);

    const level = numeric(member.level);
    if (level !== null) levels.push(level);
    const gearScore = numeric(member.gearScore);
    if (gearScore !== null) {
      const player = { name: member.ign, score: gearScore };
      gearMembers.push({ ...player, className });
      gear.push(gearScore);
      classRow.gearScores.push(gearScore);
      if (!highestGear || gearScore > highestGear.score) highestGear = player;
      if (!lowestGear || gearScore < lowestGear.score) lowestGear = player;
    }
    const weeklyScore = numeric(member.weeklyContribution);
    if (weeklyScore !== null) weekly.push({ name: member.ign, className, score: weeklyScore });
    const lifetimeScore = numeric(member.totalContribution);
    if (lifetimeScore !== null) lifetime.push({ name: member.ign, className, score: lifetimeScore });

    if (member.online === false) {
      const since = Date.parse(member.offlineSince);
      const daysAbsent = Number.isFinite(since)
        ? Math.floor(Math.max(0, Date.now() - since) / (24 * 60 * 60 * 1000))
        : numeric(member.offlineDays);
      if (daysAbsent !== null && daysAbsent >= 2) inactive.push({ name: member.ign, className, score: daysAbsent });
    }
  }

  const classRows = [...classes.values()].map(row => ({
    name: row.name,
    count: row.count,
    share: members.length ? row.count / members.length : 0,
    averageGearScore: average(row.gearScores),
  })).sort((a, b) => byDescending('count', a, b));
  const titleRows = [...titles].map(([name, count]) => ({ name, count, share: members.length ? count / members.length : 0 }))
    .sort((a, b) => byDescending('count', a, b));
  weekly.sort((a, b) => byDescending('score', a, b));
  lifetime.sort((a, b) => byDescending('score', a, b));
  inactive.sort((a, b) => byDescending('score', a, b));
  const highestGearRanking = [...gearMembers].sort((a, b) => byDescending('score', a, b));
  const lowestGearRanking = [...gearMembers].sort((a, b) => a.score - b.score || a.name.localeCompare(b.name));
  const gearDistribution = distribution(gear);
  const sum = values => values.reduce((total, item) => total + item.score, 0);

  return {
    totalMembers: members.length,
    averageLevel: average(levels),
    levelCount: levels.length,
    averageGearScore: average(gear),
    gearCount: gear.length,
    weeklyContribution: { total: weekly.length ? sum(weekly) : null, count: weekly.length, top10: weekly.slice(0, 10) },
    lifetimeContribution: { total: lifetime.length ? sum(lifetime) : null, count: lifetime.length, top10: lifetime.slice(0, 10) },
    highestGearRanking: { count: gearMembers.length, top10: highestGearRanking.slice(0, 10) },
    lowestGearRanking: { count: gearMembers.length, top10: lowestGearRanking.slice(0, 10) },
    inactiveRanking: { count: inactive.length, top10: inactive },
    highestGear,
    lowestGear,
    classes: classRows,
    titles: titleRows,
    gearDistribution,
  };
}
