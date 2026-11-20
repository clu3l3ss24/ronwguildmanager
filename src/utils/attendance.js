const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function normalizeAttendanceName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function parseDate(value, today = new Date()) {
  const text = String(value || '').trim();
  let year, month, day;
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const slash = text.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
  if (iso) [, year, month, day] = iso;
  else if (slash) {
    month = slash[1]; day = slash[2]; year = slash[3] || String(today.getFullYear());
    if (year.length === 2) year = `20${year}`;
  } else {
    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) return null;
    year = parsed.getFullYear(); month = parsed.getMonth() + 1; day = parsed.getDate();
  }
  year = Number(year); month = Number(month); day = Number(day);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function parseAttendancePaste(text, today = new Date()) {
  const rows = [];
  const invalidLines = [];
  String(text || '').split(/\r?\n/).forEach((line, index) => {
    const value = line.trim();
    if (!value) return;
    const parts = (value.includes('|') ? value.split('|') : value.includes('\t') ? value.split('\t') : value.split(',')).map(part => part.trim());
    if (/^name$/i.test(parts[0] || '') && /^date$/i.test(parts[1] || '')) return;
    if (parts.length < 2 || !parts[0] || parts[0].length > 100 || (parts[2] && parts[2].length > 20)) { invalidLines.push(index + 1); return; }
    const date = parseDate(parts[1], today);
    if (!date) { invalidLines.push(index + 1); return; }
    const derivedDay = dayNames[new Date(`${date}T12:00:00`).getDay()];
    rows.push({ name: parts[0].replace(/\s+/g, ' '), date, day: parts[2] || derivedDay });
  });
  return { rows, invalidLines };
}

export function attendanceRecordId(row) {
  return `${row.date}__${encodeURIComponent(normalizeAttendanceName(row.name))}`;
}

export function attendanceMember(row, members) {
  const name = normalizeAttendanceName(row.name);
  return members.find(member => normalizeAttendanceName(member.ign || member.name || member.displayName) === name) || null;
}
