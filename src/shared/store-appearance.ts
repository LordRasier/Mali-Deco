export const storeFonts = {
  figtree: { label: 'Figtree', family: 'Figtree,Helvetica Neue,Helvetica,Arial,sans-serif' },
  georgia: { label: 'Georgia', family: 'Georgia,Times New Roman,serif' },
  arial: { label: 'Arial', family: 'Arial,Helvetica,sans-serif' },
  'dm-mono': { label: 'DM Mono', family: 'DM Mono,Consolas,monospace' },
  manrope: { label: 'Manrope', family: 'Manrope,Arial,sans-serif' },
  'nunito-sans': { label: 'Nunito Sans', family: 'Nunito Sans,Arial,sans-serif' },
  outfit: { label: 'Outfit', family: 'Outfit,Arial,sans-serif' },
  lora: { label: 'Lora', family: 'Lora,Georgia,serif' },
  'libre-baskerville': { label: 'Libre Baskerville', family: 'Libre Baskerville,Georgia,serif' },
  'cormorant-garamond': { label: 'Cormorant Garamond', family: 'Cormorant Garamond,Georgia,serif' },
  bitter: { label: 'Bitter', family: 'Bitter,Georgia,serif' },
  'ibm-plex-mono': { label: 'IBM Plex Mono', family: 'IBM Plex Mono,Consolas,monospace' },
} as const;
export type StoreFont = keyof typeof storeFonts;
export type StoreAppearance = { backgroundColor: string | null; headingFont: StoreFont | null; bodyFont: StoreFont | null };
export const defaultAppearance = (): StoreAppearance => ({ backgroundColor: null, headingFont: null, bodyFont: null });
export function appearanceColor(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) throw Error('El color debe tener el formato #RRGGBB.');
  return value.toLowerCase();
}
export function parseAppearance(value: unknown): StoreAppearance {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Apariencia inválida.');
  const input = value as Record<string, unknown>, keys = Object.keys(defaultAppearance());
  if (Object.keys(input).length !== keys.length || keys.some(key => !Object.hasOwn(input, key))) throw Error('Apariencia inválida.');
  const font = (value: unknown): StoreFont | null => {
    if (value === null) return null;
    if (typeof value !== 'string' || !Object.hasOwn(storeFonts, value)) throw Error('Tipografía no disponible.');
    return value as StoreFont;
  };
  return { backgroundColor: appearanceColor(input.backgroundColor), headingFont: font(input.headingFont), bodyFont: font(input.bodyFont) };
}
