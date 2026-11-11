import { newBlock, parseLanding, type BlockType, type LandingBlock, type LandingLayout } from './landing-layout';
export type BlockLocation = { block: LandingBlock; list: LandingBlock[]; index: number; path: string; zone: string };
export function locateBlock(layout: LandingLayout, id: string): BlockLocation | undefined {
  function visit(list: LandingBlock[], path: string, zone: string): BlockLocation | undefined {
    for (const [index, block] of list.entries()) {
      const here = `${path}.${index}`;
      if (block.id === id) return { block, list, index, path: here, zone };
      for (const [n, column] of block.columns.entries()) { const found = visit(column.blocks, `${here}.columns.${n}.blocks`, column.id); if (found) return found; }
    }
  }
  return visit(layout.blocks, 'landing.blocks', 'root');
}
export function blockZone(layout: LandingLayout, id: string): LandingBlock[] | undefined {
  if (id === 'root') return layout.blocks;
  function visit(blocks: LandingBlock[]): LandingBlock[] | undefined {
    for (const block of blocks) for (const column of block.columns) { if (column.id === id) return column.blocks; const found = visit(column.blocks); if (found) return found; }
  }
  return visit(layout.blocks);
}
export type BlockDrop = { type: BlockType } | { id: string };
/** Returns a validated copy. Failed/cancelled drops cannot partially mutate the page. */
export function dropBlock(layout: LandingLayout, source: BlockDrop, zone: string, index: number, createId: () => string): { layout: LandingLayout; id: string } {
  const next = structuredClone(layout), destination = blockZone(next, zone);
  if (!destination || !Number.isInteger(index) || index < 0 || index > destination.length) throw Error('Elegí un lugar válido para el bloque.');
  let block: LandingBlock;
  if ('id' in source) {
    const origin = locateBlock(next, source.id); if (!origin) throw Error('El bloque ya no existe.');
    if (blockZone({ version: 1, blocks: [origin.block] }, zone) && zone !== 'root') throw Error('Un contenedor no puede moverse dentro de sí mismo.');
    block = origin.block; origin.list.splice(origin.index, 1); if (origin.list === destination && origin.index < index) index--;
  } else block = newBlock(source.type, createId());
  destination.splice(index, 0, block);
  return { layout: parseLanding(next), id: block.id };
}
export function duplicateBlock(layout: LandingLayout, id: string, createId: () => string) {
  const next = structuredClone(layout), origin = locateBlock(next, id); if (!origin) throw Error('El bloque ya no existe.');
  const copy = structuredClone(origin.block);
  function renew(block: LandingBlock) { block.id = createId(); for (const column of block.columns) { column.id = createId(); column.blocks.forEach(renew); } }
  renew(copy); origin.list.splice(origin.index + 1, 0, copy); return { layout: parseLanding(next), id: copy.id };
}
export function resizeColumns(layout: LandingLayout, id: string, count: number, createId: () => string): LandingLayout {
  const next = structuredClone(layout), block = locateBlock(next, id)?.block;
  if (!block || block.type !== 'container' || !Number.isInteger(count) || count < 1 || count > 3) throw Error('Cantidad de columnas inválida.');
  while (block.columns.length < count) block.columns.push({ id: createId(), blocks: [] });
  if (block.columns.length > count) { const rest = block.columns.splice(count); block.columns[count - 1].blocks.push(...rest.flatMap(c => c.blocks)); }
  return parseLanding(next);
}
