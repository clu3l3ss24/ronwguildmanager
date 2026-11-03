import { getJobIcon } from '../components/JobIcon';

const WIDTH = 1440;
const PADDING = 36;
const GAP = 12;
const CARD_WIDTH = (WIDTH - PADDING * 2 - GAP * 4) / 5;
const FONT = '"Segoe UI", "Microsoft YaHei", "Noto Sans", sans-serif';

function linesFor(context, text, maxWidth) {
  const source = String(text || '');
  const characters = typeof Intl.Segmenter === 'function' ? [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(source)].map(item => item.segment) : Array.from(source);
  const lines = []; let line = '';
  for (const character of characters) {
    if (character === '\n') { lines.push(line); line = ''; continue; }
    if (line && context.measureText(line + character).width > maxWidth) { lines.push(line.trimEnd()); line = character.trimStart(); }
    else line += character;
  }
  if (line || !lines.length) lines.push(line);
  return lines;
}

const font = (context, size, weight = 400) => { context.font = `${weight} ${size}px ${FONT}`; };
function box(context, x, y, width, height, fill, stroke) {
  context.beginPath(); context.roundRect(x, y, width, height, 8);
  context.fillStyle = fill; context.fill();
  if (stroke) { context.strokeStyle = stroke; context.lineWidth = 1; context.stroke(); }
}
function writeLines(context, lines, x, y, lineHeight, color) {
  context.fillStyle = color;
  lines.forEach((line, index) => context.fillText(line, x, y + index * lineHeight));
}

function loadImage(source) {
  return new Promise(resolve => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => resolve(null); image.src = source; });
}

export async function renderTeamImage(snapshot) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser could not create the team image.');
  context.textBaseline = 'top';
  font(context, 36, 700);
  const titleLines = linesFor(context, snapshot.name, WIDTH - PADDING * 2);
  font(context, 16);
  const guildLines = linesFor(context, `${snapshot.guildName} · ${snapshot.modeName}`, WIDTH - PADDING * 2);
  const headerHeight = 40 + guildLines.length * 23 + 14 + titleLines.length * 44 + 32;
  const rows = snapshot.parties.map(party => {
    font(context, 20, 700);
    const partyLines = linesFor(context, party.name, WIDTH - PADDING * 2 - 230);
    const cards = party.slots.map(member => {
      if (!member) return null;
      font(context, 22, 700);
      const nameLines = linesFor(context, member.ign, CARD_WIDTH - 28);
      font(context, 16);
      const classLines = linesFor(context, member.className || 'Unknown', CARD_WIDTH - 68);
      return { member, nameLines, classLines, height: 18 + nameLines.length * 28 + 10 + Math.max(28, classLines.length * 21) + 12 + 25 + 14 };
    });
    const cardHeight = Math.max(132, ...cards.filter(Boolean).map(card => card.height));
    return { party, partyLines, cards, cardHeight, headerHeight: partyLines.length * 25 + 12 };
  });
  const height = headerHeight + rows.reduce((sum, row) => sum + row.headerHeight + row.cardHeight + 22, 0) + 56;
  const scale = Math.min(2, 16384 / height);
  if (scale < 1) throw new Error('This team has too many parties for one readable image. Split it into smaller teams and try again.');
  canvas.width = WIDTH * scale; canvas.height = Math.ceil(height * scale);
  context.scale(scale, scale); context.textBaseline = 'top';
  context.fillStyle = '#0b1020'; context.fillRect(0, 0, WIDTH, height);
  context.fillStyle = '#d7b76d'; context.fillRect(0, 0, WIDTH, 5);
  font(context, 16, 600);
  writeLines(context, guildLines, PADDING, 29, 23, '#aab6d8');
  font(context, 36, 700);
  writeLines(context, titleLines, PADDING, 43 + guildLines.length * 23, 44, '#f1d58b');
  const icons = new Map();
  for (const member of snapshot.parties.flatMap(party => party.slots).filter(Boolean)) {
    const icon = getJobIcon(member.className);
    if (icon) icons.set(icon.source, null);
  }
  await Promise.all([...icons.keys()].map(async source => icons.set(source, await loadImage(source))));
  let y = headerHeight;
  for (const row of rows) {
    font(context, 20, 700);
    writeLines(context, row.partyLines, PADDING, y, 25, '#e0e7fa');
    const assigned = row.party.slots.filter(Boolean).length;
    const score = row.party.slots.filter(Boolean).reduce((sum, member) => sum + Number(member.gearScore || 0), 0);
    font(context, 15);
    const summary = `${assigned}/5 · ${score.toLocaleString()} GS`;
    context.fillStyle = '#aab6d8'; context.fillText(summary, WIDTH - PADDING - context.measureText(summary).width, y + 3);
    const cardY = y + row.headerHeight;
    for (let index = 0; index < 5; index += 1) {
      const x = PADDING + index * (CARD_WIDTH + GAP);
      const card = row.cards[index];
      box(context, x, cardY, CARD_WIDTH, row.cardHeight, card ? '#18223a' : '#10182a', card ? '#3b4b70' : '#2c3854');
      if (!card) {
        font(context, 18, 500); context.fillStyle = '#7f8eaf';
        context.fillText(`Slot ${index + 1} · Open`, x + 17, cardY + 24); continue;
      }
      const { member, nameLines, classLines } = card;
      font(context, 22, 700); writeLines(context, nameLines, x + 14, cardY + 16, 28, '#f0f4ff');
      const classY = cardY + 16 + nameLines.length * 28 + 10;
      const icon = getJobIcon(member.className);
      const sprite = icon && icons.get(icon.source);
      if (sprite) context.drawImage(sprite, icon.x, icon.y, 44, 44, x + 14, classY, 27, 27);
      else { box(context, x + 14, classY, 27, 27, '#35415f'); font(context, 18, 700); context.fillStyle = '#c7d0e9'; context.fillText('?', x + 22, classY + 4); }
      font(context, 16); writeLines(context, classLines, x + 49, classY + 2, 21, '#c4cee7');
      const statsY = classY + Math.max(28, classLines.length * 21) + 12;
      font(context, 20, 700); context.fillStyle = '#f0d38a'; context.fillText(`${Number(member.gearScore || 0).toLocaleString()} GS`, x + 14, statsY);
      font(context, 14); context.fillStyle = member.online ? '#79d8ae' : '#9aa7c5';
      const status = member.online ? 'Online' : 'Offline';
      context.fillText(status, x + CARD_WIDTH - 14 - context.measureText(status).width, statsY + 4);
    }
    y += row.headerHeight + row.cardHeight + 22;
  }
  font(context, 13, 500); context.fillStyle = '#8594b6';
  context.fillText('RONW GUILD MANAGER', PADDING, height - 31);
  const stamp = new Date(snapshot.createdAt).toLocaleString();
  context.fillText(stamp, WIDTH - PADDING - context.measureText(stamp).width, height - 31);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('The team image could not be created. Please try again.');
  const safeName = snapshot.name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').trim() || 'Team';
  return { blob, width: canvas.width, height: canvas.height, filename: `RONW-${safeName}.png` };
}
