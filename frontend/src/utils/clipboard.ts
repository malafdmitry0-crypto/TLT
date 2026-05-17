export function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard) {
    return navigator.clipboard.writeText(text);
  }
  return Promise.reject(new Error('Clipboard API недоступен'));
}

export async function readFromClipboard(): Promise<string> {
  if (navigator.clipboard?.readText) {
    return navigator.clipboard.readText();
  }
  throw new Error('Clipboard API недоступен');
}

export function parseTsv(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => line.split('\t'));
}

const DANGEROUS_SPREADSHEET_PREFIXES = ['=', '+', '-', '@'];

export function safeSpreadsheetText(value: string): string {
  const trimmedLeft = value.trimStart();
  if (DANGEROUS_SPREADSHEET_PREFIXES.some((prefix) => trimmedLeft.startsWith(prefix))) {
    return `'${value}`;
  }
  return value;
}

export function buildTsv(rows: string[][]): string {
  return rows.map((row) => row.map(safeSpreadsheetText).join('\t')).join('\r\n');
}
