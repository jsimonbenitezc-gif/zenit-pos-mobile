export function formatMoney(value, currency = '$', locale = 'es-MX') {
  const n = parseFloat(value) || 0;
  return `${currency}${n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatMoneyCompact(value, currency = '$') {
  const n = parseFloat(value) || 0;
  if (n >= 1_000_000) return `${currency}${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000)    return `${currency}${(n / 1_000).toFixed(0)}k`;
  if (n >= 1_000)     return `${currency}${(n / 1_000).toFixed(1)}k`;
  return `${currency}${Math.round(n)}`;
}
