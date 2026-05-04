export const MONEY_FORMAT = { minimumFractionDigits: 2, maximumFractionDigits: 2 };

export function formatMoneyArs(value) {
  return `$${Number(value || 0).toLocaleString('es-AR', MONEY_FORMAT)}`;
}

export function formatDecimalInput(value) {
  if (value === '' || value == null) return '';
  return Number(value || 0).toLocaleString('es-AR', MONEY_FORMAT);
}

export function sanitizeDecimalInput(value, { maxDecimals = 2, allowNegative = false } = {}) {
  const raw = String(value ?? '').replace(/\s/g, '');
  if (!raw) return '';
  const negative = allowNegative && raw.startsWith('-') ? '-' : '';
  const unsigned = raw.replace(/-/g, '');
  const commaIndex = unsigned.indexOf(',');
  const hasDecimals = commaIndex !== -1;
  const integerRaw = hasDecimals ? unsigned.slice(0, commaIndex) : unsigned;
  const decimalsRaw = hasDecimals ? unsigned.slice(commaIndex + 1) : '';
  const integer = integerRaw.replace(/\D/g, '');
  const formattedInteger = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  if (!hasDecimals) return `${negative}${formattedInteger}`;
  const decimals = decimalsRaw.replace(/\D/g, '').slice(0, maxDecimals);
  return `${negative}${formattedInteger},${decimals}`;
}

export function parseDecimalInput(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return 0;
  const normalized = raw.includes(',')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw.replace(/\.(?=\d{3}(?:\D|$))/g, '');
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}
