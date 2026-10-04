function safeAmount(amount: number) {
  const numeric = Number(amount);
  return Number.isFinite(numeric) ? numeric : 0;
}

function safeCurrency(currency: unknown) {
  const normalized = String(currency || "EUR").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : "EUR";
}

export function formatCurrency(
  amount: number,
  currency = "EUR",
  locale?: string,
) {
  const numeric = safeAmount(amount);
  const normalizedCurrency = safeCurrency(currency);
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: normalizedCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numeric);
  } catch {
    return `${numeric.toFixed(2)} ${normalizedCurrency}`;
  }
}

export function formatMinorCurrency(
  amount: number,
  currency = "EUR",
  locale?: string,
) {
  return formatCurrency(amount / 100, currency, locale);
}
