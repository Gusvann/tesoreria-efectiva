export function isoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number), date = new Date(Date.UTC(y, m - 1, d));
  return y >= 1900 && y <= 9999 && date.toISOString().slice(0, 10) === value;
}
export function addDays(value, days) {
  if (!isoDate(value) || !Number.isInteger(days)) throw new Error('Fecha inválida.');
  const d = new Date(`${value}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function today(now = Date.now(), timezone = 'America/Mexico_City') {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(now)).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
export function dateLabel(value, { year = false } = {}) {
  if (!isoDate(value)) return '—';
  return new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', ...(year ? { year: 'numeric' } : {}), timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`));
}
