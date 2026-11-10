/** Explicit public projection: never spread database JSON into the public DTO. */
export function publicVariantOptions(raw: unknown): { options?: { name: string; value: string }[] } {
  let value = raw;
  if (typeof raw === 'string') { try { value = JSON.parse(raw); } catch { return {}; } }
  if (!Array.isArray(value) || !value.length || value.length > 8) return {};
  const options = value.filter(item => item && typeof item.name === 'string' && typeof item.value === 'string'
    && item.name.trim() && item.name.length <= 60 && item.value.trim() && item.value.length <= 100)
    .map(item => ({ name: item.name.trim(), value: item.value.trim() }));
  return options.length ? { options } : {};
}
