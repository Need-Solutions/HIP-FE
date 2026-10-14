// CSV export shared by hiker history, participants and other admin tables.

/** Signed figures such as "-49.5%", "+0.6 pt" or "-3": safe, and kept as typed so the export matches the screen. */
const SIGNED_FIGURE = /^[+-]\d[\d.,]*(%| pt)?$/;

/** Quotes when needed, and defuses values a spreadsheet would run as a formula (CSV injection). */
export function csvCell(raw: string): string {
  const v = /^[=+\-@\t\r]/.test(raw) && !SIGNED_FIGURE.test(raw) ? `'${raw}` : raw;
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export const toCsv = (rows: string[][]) => rows.map((r) => r.map(csvCell).join(',')).join('\r\n');

export function downloadText(filename: string, text: string, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
