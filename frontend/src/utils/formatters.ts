export function formatNumber(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }
  return value.toLocaleString('ru-RU', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatPower(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  if (Math.abs(value) >= 1000) {
    return `${formatNumber(value / 1000)} кВт`;
  }
  return `${formatNumber(value)} Вт`;
}

export function formatTemperature(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `${formatNumber(value, 1)} °C`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}
