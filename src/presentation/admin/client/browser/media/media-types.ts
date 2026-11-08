import { ApiError } from '../../api';

export interface MediaItem { id: string; alt: string; width: number; height: number; position: number; retired: boolean }
export interface MediaList { revision: number; items: MediaItem[] }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

/** Treat malformed success as uncertain, never as permission to repeat a write. */
export function parseMediaList(value: unknown): MediaList {
  const invalid = () => new ApiError(502, 'No se pudo confirmar la lista de imágenes. Recargá la lista antes de continuar.');
  if (!record(value) || !Number.isInteger(value.revision) || Number(value.revision) < 0 || Number(value.revision) > 4294967295 || !Array.isArray(value.items)) throw invalid();
  const ids = new Set<string>();
  const items = value.items.map((item: unknown): MediaItem => {
    if (!record(item) || typeof item.id !== 'string' || !uuid.test(item.id) || ids.has(item.id) || typeof item.alt !== 'string'
      || [...item.alt].length > 300 || /[\p{Cc}\p{Cf}\p{Cs}]/u.test(item.alt) || typeof item.retired !== 'boolean'
      || !Number.isSafeInteger(item.width) || !Number.isSafeInteger(item.height) || Number(item.width) < 1 || Number(item.height) < 1
      || Number(item.width) > 8000 || Number(item.height) > 8000 || Number(item.width) * Number(item.height) > 16000000
      || !Number.isSafeInteger(item.position) || Number(item.position) < 0) throw invalid();
    ids.add(item.id);
    return { id: item.id, alt: item.alt, width: Number(item.width), height: Number(item.height), position: Number(item.position), retired: item.retired };
  });
  if (items.filter(item => !item.retired).length > 10) throw invalid();
  return { revision: Number(value.revision), items };
}
