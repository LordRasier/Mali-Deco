const key = (value: string) => value.trim().normalize('NFC').toLocaleLowerCase('es');

/** Remove only complete material components from automatic names; never alter words such as "Plato". */
export function publicVariantName(name: string, materials: readonly string[] = []) {
  const hidden = new Set(materials.filter(Boolean).map(key));
  if (!hidden.size) return name;
  const parts = name.split(/\s*[/·|]\s*/);
  const visible = parts.filter(part => !hidden.has(key(part.replace(/^material\s*:\s*/i, ''))));
  return visible.length === parts.length ? name : visible.join(' / ') || 'Estándar';
}
