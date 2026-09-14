// Kuwaiti Dinar (KWD) is subdivided into 1,000 fils, so amounts are
// conventionally shown with 3 decimals, not 2 -- mirrors the web app's
// frontend/src/lib/currency.ts formatCurrency().
export function formatCurrency(value: number): string {
  return `KWD ${value.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;
}

// Deliberately not date.toISOString().slice(0,10) -- that converts to
// UTC first, which can silently roll the date back a day for anyone
// west of UTC in the evening. Building the string from local
// getFullYear/Month/Date keeps it the date the user actually picked.
export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
