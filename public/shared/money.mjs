/** Money boundary shared by API and browser. Never silently round user input. */
export const MAX_CENTS = 999999999999999n;
export function cents(value, { allowNegative = false, allowZero = true } = {}) {
  if (typeof value !== 'string') throw new Error('Escribe el importe como texto decimal, por ejemplo 1,234.50.');
  let text = value.trim().replace(/[\u00a0\u202f]/g, ' ');
  if (!text || text.length > 80) throw new Error('Escribe una cantidad válida.');
  let negative = false;
  if (text.startsWith('(') && text.endsWith(')')) { negative = true; text = text.slice(1, -1).trim(); }
  if (/^[\-−]/.test(text)) { if (negative) throw new Error('Signo inválido.'); negative = true; text = text.slice(1).trim(); }
  text = text.replace(/^MXN\s*/i, '').replace(/^\$\s*/, '').replace(/\s*MXN$/i, '');
  if (text === '—') text = '0';
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{0,2})?$/.test(text) && !/^\.\d{1,2}$/.test(text)) throw new Error('Usa una cantidad con hasta dos decimales; el formato se aplica automáticamente.');
  const [whole = '0', decimal = ''] = text.replaceAll(',', '').split('.');
  let amount = BigInt(whole || '0') * 100n + BigInt(decimal.padEnd(2, '0'));
  if (negative) amount = -amount;
  if ((!allowNegative && amount < 0n) || (!allowZero && amount === 0n) || amount > MAX_CENTS || amount < -MAX_CENTS) throw new Error('Importe fuera de rango. Los movimientos deben ser mayores a cero.');
  return amount;
}
export function decimal(amount) {
  const n = BigInt(amount ?? 0), abs = n < 0n ? -n : n;
  return `${n < 0n ? '-' : ''}${abs / 100n}.${String(abs % 100n).padStart(2, '0')}`;
}
export function money(amount, { symbol = true, accounting = true } = {}) {
  const n = BigInt(amount ?? 0), abs = n < 0n ? -n : n;
  const value = `${symbol ? '$' : ''}${(abs / 100n).toLocaleString('es-MX')}.${String(abs % 100n).padStart(2, '0')}`;
  return n < 0n ? (accounting ? `(${value})` : `-${value}`) : value;
}
export function roundRatio(n, numerator, denominator) {
  n = BigInt(n); numerator = BigInt(numerator); denominator = BigInt(denominator);
  if (denominator <= 0n) throw new Error('Divisor inválido.');
  const raw = n * numerator, sign = raw < 0n ? -1n : 1n, abs = raw < 0n ? -raw : raw;
  return sign * ((abs + denominator / 2n) / denominator);
}
export function excelAmount(value) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Importe numérico inválido.');
    const units = Math.round(value * 100), rounded = units / 100;
    if (!Number.isSafeInteger(units) || Math.abs(value - rounded) > Math.min(1e-8, Number.EPSILON * Math.max(1, Math.abs(value)) * 2)) throw new Error('El importe tiene más de dos decimales.');
    return cents(decimal(BigInt(units)), { allowZero: false });
  }
  return cents(String(value ?? ''), { allowZero: false });
}
