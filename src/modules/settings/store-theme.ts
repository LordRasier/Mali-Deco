import { BadRequestException } from '@nestjs/common';

export const DEFAULT_PRIMARY_COLOR = '#073dcc';
export function parsePrimaryColor(value: unknown): string {
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) throw new BadRequestException('Invalid primary color');
  return value.toLowerCase();
}
function channels(hex: string) { return [1, 3, 5].map(offset => Number.parseInt(hex.slice(offset, offset + 2), 16)); }
function luminance(hex: string) {
  const rgb = channels(hex).map(value => { const s = value / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
export function contrast(a: string, b: string) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
function shade(color: string, factor: number) { return '#' + channels(color).map(value => Math.round(value * factor).toString(16).padStart(2, '0')).join(''); }
export function themePalette(value: string) {
  const primary = parsePrimaryColor(value);
  let ink = primary;
  for (let factor = 0.95; contrast(ink, '#ffffff') < 4.5; factor -= 0.05) ink = shade(primary, Math.max(0, factor));
  return { primary, ink, onPrimary: contrast(primary, '#ffffff') >= 4.5 ? '#ffffff' : '#000000', strong: shade(ink, 0.65) };
}
export function themeCss(value: string) {
  const p = themePalette(value);
  return `:root{--blue:${p.primary};--primary-ink:${p.ink};--on-primary:${p.onPrimary};--primary-strong:${p.strong};}`;
}
