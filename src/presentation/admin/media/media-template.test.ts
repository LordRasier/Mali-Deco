import assert from 'node:assert/strict';
import test from 'node:test';
import { join } from 'node:path';
import { createViewEngine } from '../../view-engine';

test('private media partial escapes identifiers and ships disabled native controls without HTML write destinations', async () => {
  const engine = createViewEngine({});
  const html = await new Promise<string>((resolve, reject) => engine.__express(join(__dirname, '../views/admin-product-images.hbs'),
    { layout: false, product: { id: '" onclick="alert(1)' } }, (error, value) => error ? reject(error) : resolve(value!)));
  assert.match(html, /data-admin-media-root/); assert.doesNotMatch(html, /onclick="alert/);
  assert.match(html, /data-media-file[^>]*disabled/); assert.match(html, /data-media-submit[^>]*disabled/);
  assert.match(html, /<input[^>]*\bmultiple\b[^>]*>/); assert.match(html, /data-media-queue/);
  assert.match(html, /type="button"[^>]*data-media-discard[^>]*disabled[^>]*>Descartar selección/);
  assert.match(html, /method="dialog"/); assert.doesNotMatch(html, /method="post"|action="\/api|csrf|sessionToken/);
  for (const phrase of ['5 MiB', '16 megapíxeles', '8000', '384 KiB', '1 MiB', 'retiradas']) assert.ok(html.includes(phrase));
});
