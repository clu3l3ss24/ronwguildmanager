import { getJobIcon } from '../components/JobIcon';

const WIDTH = 1920;
const PADDING = 40;
const PARTY_COLUMNS = 4;
const PARTY_GAP = 8;
const PLAYER_ROW_HEIGHT = 37;
const PLAYER_ROW_GAP = 3;
const FONT = '"Segoe UI", "Microsoft YaHei", "Noto Sans", sans-serif';

function linesFor(context, text, maxWidth, maxLines = Infinity) {
  const source = String(text || '');
  const characters = typeof Intl.Segmenter === 'function' ? [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(source)].map(item => item.segment) : Array.from(source);
  const lines = []; let line = '';
  for (const character of characters) {
    if (character === '\n') { lines.push(line); line = ''; continue; }
    if (line && context.measureText(line + character).width > maxWidth) { lines.push(line.trimEnd()); line = character.trimStart(); }
    else line += character;
  }
  if (line || !lines.length) lines.push(line);
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = `${lines[maxLines - 1].slice(0, -1)}…`; }
  return lines;
}

const font = (context, size, weight = 400) => { context.font = `${weight} ${size}px ${FONT}`; };
function box(context, x, y, width, height, fill, stroke, radius = 10) {
  context.beginPath(); context.roundRect(x, y, width, height, radius);
  context.fillStyle = fill; context.fill();
  if (stroke) { context.strokeStyle = stroke; context.lineWidth = 1; context.stroke(); }
}
function writeLines(context, lines, x, y, lineHeight, color) {
  context.fillStyle = color;
  lines.forEach((line, index) => context.fillText(line, x, y + index * lineHeight));
}

export async function renderTeamImage(snapshot) {
  const contextCanvas = document.createElement('canvas');
  const measure = contextCanvas.getContext('2d');
  if (!measure) throw new Error('This browser could not create the team image.');
  measure.textBaseline = 'top';
  const teams = snapshot.teams || [];
  const players = teams.flatMap(team => team.parties.flatMap(party => party.slots)).filter(Boolean);
  const partyCount = teams.reduce((total, team) => total + team.parties.length, 0);
  const allGear = players.reduce((sum, member) => sum + Number(member.gearScore || 0), 0);

  // Teams sit side by side; each team uses a four-column party grid with five stacked player rows.
  const columns = teams.length > 1 ? 2 : 1;
  const columnGap = 16;
  const teamWidth = (WIDTH - PADDING * 2 - columnGap * (columns - 1)) / columns;
  const teamLayouts = teams.map(team => {
    const partyWidth = (teamWidth - 24 - PARTY_GAP * (PARTY_COLUMNS - 1)) / PARTY_COLUMNS;
    const parties = team.parties.map(party => {
      const assigned = party.slots.filter(Boolean);
      const gear = assigned.reduce((sum, member) => sum + Number(member.gearScore || 0), 0);
      return { party, assigned, gear };
    });
    const nameLines = (() => { font(measure, 18, 700); return linesFor(measure, team.name, teamWidth - 240, 1); })();
    const partyRows = Math.ceil(parties.length / PARTY_COLUMNS);
    const partyCardHeight = 25 + 5 * PLAYER_ROW_HEIGHT + 4 * PLAYER_ROW_GAP;
    return { team, parties, nameLines, headerHeight: 38, partyWidth, partyCardHeight, blockHeight: 38 + (parties.length ? partyRows * (partyCardHeight + PARTY_GAP) : 32) + 8 };
  });
  const headerHeight = 112;
  const rowHeights = Array.from({ length: Math.ceil(teamLayouts.length / columns) }, (_, row) => Math.max(0, ...teamLayouts.slice(row * columns, (row + 1) * columns).map(team => team.blockHeight)));
  const rowGap = 12;
  const footerHeight = 32;
  const height = headerHeight + rowHeights.reduce((sum, rowHeight) => sum + rowHeight, 0) + Math.max(0, rowHeights.length - 1) * rowGap + footerHeight;
  if (height > 16384) throw new Error('This roster is too large for one readable image. Reduce the number of parties and try again.');
  // Render enough pixels for a sharp full-screen preview on high-density displays.
  const scale = Math.min(3, 16384 / height);
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH * scale; canvas.height = Math.ceil(height * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser could not create the team image.');
  context.scale(scale, scale); context.textBaseline = 'top';
  const background = context.createLinearGradient(0, 0, WIDTH, height);
  background.addColorStop(0, '#0a1020'); background.addColorStop(0.52, '#111a2d'); background.addColorStop(1, '#0b1222');
  context.fillStyle = background; context.fillRect(0, 0, WIDTH, height);
  context.fillStyle = '#d9b765'; context.fillRect(0, 0, WIDTH, 5);
  font(context, 16, 700); context.fillStyle = '#efd58c'; context.fillText((snapshot.modeName || 'Guild League') + ' Roster', PADDING, 14);
  font(context, 30, 800); context.fillStyle = '#f6f2e7'; context.fillText(snapshot.guildName || 'RONW Guild', PADDING, 38);
  font(context, 12); context.fillStyle = '#aab6cc'; context.fillText('Page ' + (snapshot.pageNumber || 1) + ' of ' + (snapshot.pageCount || 1) + ' | Parties ' + (snapshot.partyStart || 1) + '-' + (snapshot.partyEnd || 0) + ' of ' + (snapshot.totalParties || 0) + ' | ' + new Date(snapshot.createdAt).toLocaleDateString(), PADDING, 78);
  const summaryX = WIDTH - PADDING - 500; const summaryY = 20; const summaryWidth = 500;
  box(context, summaryX, summaryY, summaryWidth, 68, 'rgba(10, 16, 30, .68)', 'rgba(217, 183, 101, .35)', 11);
  const summaries = [
    { value: String(teams.length).padStart(2, '0'), label: 'TEAMS' },
    { value: String(partyCount).padStart(2, '0'), label: 'PARTIES' },
    { value: String(players.length).padStart(2, '0'), label: 'PLAYERS' },
    { value: allGear.toLocaleString(), label: 'TOTAL GS' },
  ];
  summaries.forEach((item, index) => {
    const x = summaryX + 16 + index * 118;
    font(context, index === 3 ? 16 : 21, 800); context.fillStyle = '#f4df9e'; context.fillText(item.value, x, summaryY + 9);
    font(context, 8, 700); context.fillStyle = '#9eabc4'; context.fillText(item.label, x, summaryY + 42);
  });
  context.fillStyle = 'rgba(217, 183, 101, .4)'; context.fillRect(PADDING, 101, WIDTH - PADDING * 2, 1);
  const icons = new Map();
  for (const member of players) { const icon = getJobIcon(member.className); if (icon) icons.set(icon.source, null); }
  await Promise.all([...icons.keys()].map(source => new Promise(resolve => {
    const image = new Image(); image.onload = () => { icons.set(source, image); resolve(); }; image.onerror = () => resolve(); image.src = source;
  })));
  const rowOffsets = [];
  let currentRowY = headerHeight;
  rowHeights.forEach(rowHeight => { rowOffsets.push(currentRowY); currentRowY += rowHeight + rowGap; });
  for (const [teamIndex, teamLayout] of teamLayouts.entries()) {
    const { parties, partyWidth, partyCardHeight } = teamLayout;
    const column = teamIndex % columns;
    const row = Math.floor(teamIndex / columns);
    const x0 = PADDING + column * (teamWidth + columnGap);
    let y = rowOffsets[row];
    const teamPlayers = parties.reduce((count, party) => count + party.assigned.length, 0);
    const teamGear = parties.reduce((sum, party) => sum + party.gear, 0);
    box(context, x0, y, teamWidth, 32, '#19243a', '#344563', 8);
    context.fillStyle = '#d9b765'; context.fillRect(x0, y, 4, 32);
    font(context, 18, 700); writeLines(context, teamLayout.nameLines, x0 + 13, y + 7, 20, '#f4f6fb');
    const teamSummary = teamPlayers + ' players | ' + parties.length + ' parties | ' + teamGear.toLocaleString() + ' GS';
    font(context, 10, 600); context.fillStyle = '#a6b3ca';
    context.fillText(teamSummary, x0 + teamWidth - context.measureText(teamSummary).width - 10, y + 11);
    y += teamLayout.headerHeight;
    if (!parties.length) { font(context, 12); context.fillStyle = '#8492aa'; context.fillText('No parties assigned to this team yet.', x0 + 12, y + 4); continue; }
    for (const [partyIndex, partyRow] of parties.entries()) {
      const partyColumn = partyIndex % PARTY_COLUMNS;
      const partyRowIndex = Math.floor(partyIndex / PARTY_COLUMNS);
      const x = x0 + 12 + partyColumn * (partyWidth + PARTY_GAP);
      const cardY = y + partyRowIndex * (partyCardHeight + PARTY_GAP);
      box(context, x, cardY, partyWidth, partyCardHeight, '#111b30', '#344563', 7);
      context.fillStyle = '#202d46'; context.fillRect(x + 1, cardY + 1, partyWidth - 2, 24);
      font(context, 11, 700); context.fillStyle = '#f4df9e';
      context.fillText(partyRow.party.name || ('Party ' + (partyIndex + 1)), x + 8, cardY + 6);
      const partySummary = partyRow.assigned.length + '/5 · ' + partyRow.gear.toLocaleString() + ' GS';
      font(context, 9, 600); context.fillStyle = '#a6b3ca'; context.textAlign = 'right'; context.fillText(partySummary, x + partyWidth - 8, cardY + 7); context.textAlign = 'left';
      for (let slotIndex = 0; slotIndex < 5; slotIndex += 1) {
        const member = partyRow.party.slots[slotIndex];
        const slotY = cardY + 25 + slotIndex * (PLAYER_ROW_HEIGHT + PLAYER_ROW_GAP);
        const slotX = x + 4; const slotWidth = partyWidth - 8;
        box(context, slotX, slotY, slotWidth, PLAYER_ROW_HEIGHT, member ? '#17233a' : '#101827', member ? '#2c3d5b' : '#27344b', 4);
        if (!member) {
          font(context, 10, 600); context.fillStyle = '#71809b'; context.fillText('SLOT 0' + (slotIndex + 1) + '  ·  OPEN', slotX + 8, slotY + 13);
          continue;
        }
        context.fillStyle = member.online ? '#66d3a4' : '#78869f'; context.beginPath(); context.arc(slotX + 9, slotY + PLAYER_ROW_HEIGHT / 2, 3, 0, Math.PI * 2); context.fill();
        const jobIcon = getJobIcon(member.className); const sprite = jobIcon && icons.get(jobIcon.source);
        if (sprite) context.drawImage(sprite, jobIcon.x, jobIcon.y, jobIcon.width || 44, jobIcon.height || 44, slotX + 16, slotY + 7, 22, 22);
        const textX = slotX + 44;
        font(context, 13, 700); context.fillStyle = '#f4f6fb'; context.textAlign = 'left';
        const nameLines = linesFor(context, member.ign, slotWidth - 104, 1); context.fillText(nameLines[0], textX, slotY + 5);
        font(context, 9, 500); context.fillStyle = '#99a9c2';
        const classLines = linesFor(context, member.className || 'Unknown', slotWidth - 104, 1); context.fillText(classLines[0], textX, slotY + 22);
        font(context, 12, 700); context.fillStyle = '#f4f6fb'; context.textAlign = 'right'; context.fillText(Number(member.gearScore || 0).toLocaleString(), slotX + slotWidth - 7, slotY + 6);
        font(context, 8, 600); context.fillStyle = '#92a1bc'; context.fillText('GS', slotX + slotWidth - 7, slotY + 22); context.textAlign = 'left';
      }
    }
  }
  context.fillStyle = 'rgba(217, 183, 101, .35)'; context.fillRect(PADDING, height - 25, WIDTH - PADDING * 2, 1);
  font(context, 11, 700); context.fillStyle = '#8d9bb6';
  context.fillText((snapshot.modeName || 'Guild League') + ' Roster  |  PAGE ' + (snapshot.pageNumber || 1) + ' OF ' + (snapshot.pageCount || 1), PADDING, height - 17);
  font(context, 11); context.fillStyle = '#73819b'; context.textAlign = 'right';
  context.fillText('RONW GUILD MANAGER', WIDTH - PADDING, height - 23); context.textAlign = 'left';

  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('The team image could not be created. Please try again.');
  const safeName = (snapshot.guildName || 'Guild').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').trim() || 'Guild';
  const pageSuffix = snapshot.pageCount > 1 ? `-Page-${snapshot.pageNumber}-of-${snapshot.pageCount}` : '';
  return { blob, width: canvas.width, height: canvas.height, filename: `RONW-${safeName}-Roster${pageSuffix}.png` };
}
