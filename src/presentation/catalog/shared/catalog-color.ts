/** Only six-digit color literals may enter presentation attributes; never URLs or CSS. */
export function catalogColor(value: unknown): string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : '';
}
