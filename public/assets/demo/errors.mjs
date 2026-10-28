export class AppError extends Error {
  constructor(status, code, message, details) { super(message); this.status = status; this.code = code; this.details = details; }
}
export function fail(status, code, message, details) { throw new AppError(status, code, message, details); }
export function requireValue(condition, message, code = 'VALIDATION') { if (!condition) fail(422, code, message); }
export function text(value, name, max = 160, { optional = false } = {}) {
  if (optional && (value === undefined || value === null || value === '')) return '';
  requireValue(typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max && !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value), `${name}: texto válido de hasta ${max} caracteres.`);
  return value.trim();
}
export function keys(body, allowed) {
  requireValue(body && typeof body === 'object' && !Array.isArray(body), 'El cuerpo debe ser un objeto.');
  const unknown = Object.keys(body).filter(key => !allowed.includes(key));
  requireValue(!unknown.length, `Campos no permitidos: ${unknown.join(', ')}.`);
}
