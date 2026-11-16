import { getJobIcon } from '../components/JobIcon';

const WIDTH = 1920;
const PADDING = 40;
const GAP = 10;
const PARTY_GAP = 7;
const SLOT_WIDTH = (WIDTH - PADDING * 2 - GAP * 4) / 5;
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

  // Each party occupies one compact row, with five player slots aligned across the image.
  const teamLayouts = teams.map(team => {
    const parties = team.parties.map(party => {
      const assigned = party.slots.filter(Boolean);
      const gear = assigned.reduce((sum, member) => sum + Number(member.gearScore || 0), 0);
      const cards = Array.from({ length: 5 }, (_, index) => {
        const member = party.slots[index];
        if (!member) return null;
        font(measure, 20, 700);
        const nameLines = linesFor(measure, member.ign, SLOT_WIDTH - 166, 2);
        font(measure, 12, 500);
        const classLines = linesFor(measure, member.className || 'Unknown', SLOT_WIDTH - 166, 1);
        return { member, nameLines, classLines, height: 14 + nameLines.length * 23 + 3 + 15 + 12 };
      });
      return { party, cards, assigned, gear, cardHeight: Math.max(68, ...cards.filter(Boolean).map(card => card.height)) };
    });
    const nameLines = (() => { font(measure, 21, 700); return linesFor(measure, team.name, WIDTH - PADDING * 2 - 260, 1); })();
    return { team, parties, nameLines, headerHeight: 54 };
  });
  const headerHeight = 164;
  const height = headerHeight + teamLayouts.reduce((sum, team) => sum + team.headerHeight + team.parties.reduce((partySum, party) => partySum + 21 + party.cardHeight + PARTY_GAP, 0) + (team.parties.length ? 0 : 33) + 17, 0) + 48;
  if (height > 16384) throw new Error('This roster is too large for one readable image. Reduce the number of parties and try again.');
  const scale = Math.min(2, 16384 / height);
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH * scale; canvas.height = Math.ceil(height * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser could not create the team image.');
  context.scale(scale, scale); context.textBaseline = 'top';

  const background = context.createLinearGradient(0, 0, WIDTH, height);
  background.addColorStop(0, '#0a1020'); background.addColorStop(0.52, '#111a2d'); background.addColorStop(1, '#0b1222');
  context.fillStyle = background; context.fillRect(0, 0, WIDTH, height);
  context.fillStyle = '#d9b765'; context.fillRect(0, 0, WIDTH, 6);
  font(context, 18, 700); context.fillStyle = '#efd58c';
  context.fillText(`${snapshot.modeName || 'Guild League'} Roster`, PADDING, 25);
  font(context, 36, 800); context.fillStyle = '#f6f2e7';
  context.fillText(snapshot.guildName || 'RONW Guild', PADDING, 55);
  font(context, 14); context.fillStyle = '#aab6cc';
  context.fillText(`All teams and assigned players  ·  ${new Date(snapshot.createdAt).toLocaleDateString()}`, PADDING, 105);

  const summaryX = 1380; const summaryY = 44; const summaryWidth = WIDTH - PADDING - summaryX;
  box(context, summaryX, summaryY, summaryWidth, 82, 'rgba(10, 16, 30, .68)', 'rgba(217, 183, 101, .35)', 13);
  const summaries = [
    { value: String(teams.length).padStart(2, '0'), label: 'TEAMS' },
    { value: String(partyCount).padStart(2, '0'), label: 'PARTIES' },
    { value: String(players.length).padStart(2, '0'), label: 'PLAYERS' },
    { value: allGear.toLocaleString(), label: 'TOTAL GS' },
  ];
  summaries.forEach((item, index) => {
    const x = summaryX + 15 + index * 112;
    font(context, index === 3 ? 18 : 24, 800); context.fillStyle = '#f4df9e'; context.fillText(item.value, x, summaryY + 13);
    font(context, 10, 700); context.fillStyle = '#9eabc4'; context.fillText(item.label, x, summaryY + 49);
  });
  context.fillStyle = 'rgba(217, 183, 101, .4)'; context.fillRect(PADDING, 145, WIDTH - PADDING * 2, 1);

  const icons = new Map();
  for (const member of players) { const icon = getJobIcon(member.className); if (icon) icons.set(icon.source, null); }
  await Promise.all([...icons.keys()].map(source => new Promise(resolve => {
    const image = new Image(); image.onload = () => { icons.set(source, image); resolve(); }; image.onerror = () => resolve(); image.src = source;
  })));

  let y = headerHeight;
  for (const [teamIndex, teamLayout] of teamLayouts.entries()) {
    const { team, parties } = teamLayout;
    const teamPlayers = parties.reduce((count, party) => count + party.assigned.length, 0);
    const teamGear = parties.reduce((sum, party) => sum + party.gear, 0);
    box(context, PADDING, y, WIDTH - PADDING * 2, 43, '#19243a', '#344563', 9);
    context.fillStyle = '#d9b765'; context.fillRect(PADDING, y, 4, 43);
    font(context, 20, 700); writeLines(context, teamLayout.nameLines, PADDING + 17, y + 11, 23, '#f4f6fb');
    const teamSummary = `${teamPlayers} players  ·  ${parties.length} parties  ·  ${teamGear.toLocaleString()} GS`;
    font(context, 12, 600); context.fillStyle = '#a6b3ca';
    context.fillText(teamSummary, WIDTH - PADDING - context.measureText(teamSummary).width - 14, y + 15);
    y += teamLayout.headerHeight;

    if (!parties.length) {
      font(context, 13); context.fillStyle = '#8492aa'; context.fillText('No parties assigned to this team yet.', PADDING + 16, y + 1);
      y += 33;
    }
    for (const [partyIndex, row] of parties.entries()) {
      font(context, 12, 700); context.fillStyle = '#8492aa';
      context.fillText(row.party.name || `Party ${partyIndex + 1}`, PADDING + 5, y + 2);
      const summary = `${row.assigned.length}/5  ·  ${row.gear.toLocaleString()} GS`;
      font(context, 11, 600); context.fillText(summary, WIDTH - PADDING - context.measureText(summary).width, y + 3);
      const slotY = y + 21;
      for (let slotIndex = 0; slotIndex < 5; slotIndex += 1) {
        const x = PADDING + slotIndex * (SLOT_WIDTH + GAP); const card = row.cards[slotIndex];
        box(context, x, slotY, SLOT_WIDTH, row.cardHeight, card ? '#111b30' : '#101827', card ? '#344563' : '#27344b', 7);
        if (!card) {
          context.fillStyle = '#697695'; context.fillRect(x + 1, slotY + 7, 3, row.cardHeight - 14);
          font(context, 13, 600); context.fillStyle = '#71809b'; context.fillText(`SLOT 0${slotIndex + 1}  |  OPEN`, x + 16, slotY + 25);
          continue;
        }
        const { member, nameLines, classLines } = card;
        context.fillStyle = '#697695'; context.fillRect(x + 1, slotY + 7, 3, row.cardHeight - 14);
        context.fillStyle = member.online ? '#66d3a4' : '#78869f';
        context.beginPath(); context.arc(x + 16, slotY + row.cardHeight / 2, 5, 0, Math.PI * 2); context.fill();
        const jobIcon = getJobIcon(member.className); const sprite = jobIcon && icons.get(jobIcon.source);
        if (sprite) context.drawImage(sprite, jobIcon.x, jobIcon.y, 44, 44, x + 29, slotY + (row.cardHeight - 31) / 2, 31, 31);
        font(context, 20, 700); writeLines(context, nameLines, x + 72, slotY + 10, 23, '#f4f6fb');
        font(context, 12, 500); writeLines(context, classLines, x + 72, slotY + 13 + nameLines.length * 23, 15, '#99a9c2');
        font(context, 18, 700); context.fillStyle = '#f4f6fb'; context.textAlign = 'right';
        context.fillText(Number(member.gearScore || 0).toLocaleString(), x + SLOT_WIDTH - 14, slotY + row.cardHeight / 2 - 10);
        font(context, 10, 600); context.fillStyle = '#92a1bc';
        context.fillText('GS', x + SLOT_WIDTH - 14, slotY + row.cardHeight / 2 + 11); context.textAlign = 'left';
      }
      y += 21 + row.cardHeight + PARTY_GAP;
    }
    y += 17;
  }
  context.fillStyle = 'rgba(217, 183, 101, .35)'; context.fillRect(PADDING, height - 33, WIDTH - PADDING * 2, 1);
  font(context, 11, 700); context.fillStyle = '#8d9bb6';
  context.fillText(`${snapshot.modeName || 'Guild League'} Roster  |  ALL TEAMS`, PADDING, height - 23);
  font(context, 11); context.fillStyle = '#73819b'; context.textAlign = 'right';
  context.fillText('RONW GUILD MANAGER', WIDTH - PADDING, height - 23); context.textAlign = 'left';

  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('The team image could not be created. Please try again.');
  const safeName = (snapshot.guildName || 'Guild').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').trim() || 'Guild';
  return { blob, width: canvas.width, height: canvas.height, filename: `RONW-${safeName}-Roster.png` };
}
