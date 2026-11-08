import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { DataSource } from 'typeorm';
import { MediaRepository } from './media-repository';

const productId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const imageId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const key = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const digest = 'a'.repeat(64);
const item = { id: imageId, alt: 'foto', width: 200, height: 100, position: 0, retired_at: null };
function fixture(options: { revision?: number; prior?: boolean; archived?: boolean; rows?: typeof item[] } = {}) {
  const calls: string[] = [];
  const query = async (sql: string) => {
    calls.push(sql);
    if (sql.includes('SELECT media_revision')) return [{ media_revision: options.revision ?? 3, archived_at: options.archived ? new Date() : null, status: 'active' }];
    if (sql.includes('SELECT id, upload_digest')) return options.prior ? [{ id: imageId, upload_digest: digest }] : [];
    if (sql.includes('SELECT id, alt')) return options.rows ?? [item];
    return [];
  };
  const db = { isInitialized: true, query, transaction: async (...args: unknown[]) => (args.at(-1) as (manager: unknown) => unknown)({ query }) } as unknown as DataSource;
  return { repo: new MediaRepository(db), calls };
}
const derivatives = { 320: Buffer.from('a'), 800: Buffer.from('b'), 1600: Buffer.from('c') };
const input = { id: imageId, uploadKey: key, digest, alt: 'foto', width: 200, height: 100 };

test('replay de la misma clave y hash prevalece sobre una revision obsoleta', async () => {
  const { repo, calls } = fixture({ prior: true });
  const result = await repo.save(productId, 0, input, derivatives);
  assert.equal(result.replay, true);
  assert.equal(result.imageId, imageId);
  assert.equal(result.revision, 3);
  assert.deepEqual(result.items, [{ id: imageId, alt: 'foto', width: 200, height: 100, position: 0, retired: false }]);
  assert.ok(calls[0].includes('FOR UPDATE'));
  assert.ok(!calls.some(sql => sql.startsWith('UPDATE') || sql.startsWith('INSERT')));
});

test('misma clave con otro hash produce conflicto aun con revision obsoleta', async () => {
  const { repo } = fixture({ prior: true });
  await assert.rejects(repo.save(productId, 0, { ...input, digest: 'b'.repeat(64) }, derivatives), { status: 409 });
});

test('cambio con revision obsoleta no escribe', async () => {
  const { repo, calls } = fixture();
  await assert.rejects(repo.retire(productId, imageId, 2), { status: 412 });
  assert.ok(!calls.some(sql => sql.startsWith('UPDATE')));
});

test('orden debe ser permutacion exacta de imagenes activas', async () => {
  const { repo, calls } = fixture();
  await assert.rejects(repo.reorder(productId, 3, []), { status: 400 });
  await assert.rejects(repo.reorder(productId, 3, [imageId, imageId]), { status: 400 });
  assert.ok(!calls.some(sql => sql.startsWith('UPDATE')));
});

test('producto archivado no admite mutaciones', async () => {
  const { repo } = fixture({ archived: true });
  await assert.rejects(repo.edit(productId, imageId, 3, ''), { status: 404 });
});

test('valida controles y longitud de alt y acepta alt vacio', async () => {
  const { repo } = fixture();
  await assert.rejects(repo.edit(productId, imageId, 3, 'a\nb'), { status: 400 });
  await assert.rejects(repo.edit(productId, imageId, 3, 'á'.repeat(301)), { status: 400 });
  assert.equal((await repo.edit(productId, imageId, 3, '')).revision, 4);
});

test('restaurar exige espacio para una imagen activa', async () => {
  const retired = { ...item, retired_at: new Date() };
  const rows = Array.from({ length: 10 }, (_, n) => ({ ...item, id: `${n}` }));
  const { repo } = fixture({ rows: [...rows, retired] as typeof item[] });
  await assert.rejects(repo.restore(productId, imageId, 3), { status: 409 });
});

test('preview autorizado incluye imagen retirada de producto archivado, pero no acceso publico', async () => {
  const query = async () => [{ status: 'active', archived_at: new Date(), retired_at: new Date() }];
  const db = { isInitialized: true, query } as unknown as DataSource;
  assert.deepEqual(await new MediaRepository(db).imageAccess(productId, imageId), { public: false, preview: true });
});

test('busqueda publica por imagen devuelve null para imagen no publicada', async () => {
  const query = async () => [];
  const db = { isInitialized: true, query } as unknown as DataSource;
  assert.equal(await new MediaRepository(db).publicImageAccess(imageId), null);
});

test('precheck recupera replay o detecta conflicto antes de procesar derivados', async () => {
  const { repo } = fixture({ prior: true });
  const result = await repo.findUpload(productId, key, digest);
  assert.equal(result?.replay, true);
  assert.equal(result?.imageId, imageId);
  await assert.rejects(repo.findUpload(productId, key, 'b'.repeat(64)), { status: 409 });
  assert.equal(await fixture().repo.findUpload(productId, key, digest), null);
  await assert.rejects(fixture({ archived: true }).repo.findUpload(productId, key, digest), { status: 404 });
});


test('save bloquea cuota, comprueba packet y guarda tres derivados bajo transaccion', async () => {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const query = async (sql: string, params?: unknown[]) => {
    calls.push({ sql, params });
    if (sql.includes('SELECT media_revision')) return [{ media_revision: 3, archived_at: null, status: 'active' }];
    if (sql.includes('SELECT id, upload_digest')) return [];
    if (sql.includes('SELECT id, alt')) return [];
    if (sql.includes('FROM product_image_quota')) return [{ id: 1 }];
    if (sql.includes('SUM(byte_length)')) return [{ total: '0' }];
    if (sql.includes('max_allowed_packet')) return [{ maxPacket: 1048576 }];
    return [];
  };
  const db = { isInitialized: true, transaction: async (fn: (manager: unknown) => unknown) => fn({ query }) } as unknown as DataSource;
  const result = await new MediaRepository(db).save(productId, 3, input, derivatives);
  assert.equal(result.revision, 4);
  assert.ok(calls.some(call => call.sql.includes('product_image_quota') && call.sql.includes('FOR UPDATE')));
  assert.equal(calls.filter(call => call.sql.startsWith('INSERT INTO product_image_derivatives')).length, 3);
  assert.ok(calls.find(call => call.sql.includes('SUM(byte_length)'))!.sql.includes('FOR UPDATE'));
});

test('cuota y limite de packet rechazan antes de cualquier insercion', async () => {
  for (const scenario of ['quota', 'packet']) {
    const calls: string[] = [];
    const query = async (sql: string) => {
      calls.push(sql);
      if (sql.includes('SELECT media_revision')) return [{ media_revision: 3, archived_at: null }];
      if (sql.includes('SELECT id, alt') || sql.includes('SELECT id, upload_digest')) return [];
      if (sql.includes('FROM product_image_quota')) return [{ id: 1 }];
      if (sql.includes('SUM(byte_length)')) return [{ total: scenario === 'quota' ? 128 * 1024 * 1024 : 0 }];
      if (sql.includes('max_allowed_packet')) return [{ maxPacket: 65536 }];
      return [];
    };
    const db = { isInitialized: true, transaction: async (fn: (manager: unknown) => unknown) => fn({ query }) } as unknown as DataSource;
    await assert.rejects(new MediaRepository(db).save(productId, 3, input, derivatives), { message: scenario === 'quota' ? 'MEDIA_QUOTA_EXCEEDED' : 'MEDIA_PACKET_TOO_SMALL' });
    assert.ok(!calls.some(sql => sql.startsWith('INSERT')));
  }
});

test('restore falla cerrado si faltan derivados, sin leer blobs', async () => {
  const calls: string[] = [];
  const query = async (sql: string) => {
    calls.push(sql);
    if (sql.includes('SELECT media_revision')) return [{ media_revision: 3, archived_at: null }];
    if (sql.includes('SELECT id, alt')) return [{ ...item, retired_at: new Date() }];
    if (sql.includes('SELECT rendition')) return [{ rendition: 320, byte_length: 10 }];
    return [];
  };
  const db = { isInitialized: true, transaction: async (fn: (manager: unknown) => unknown) => fn({ query }) } as unknown as DataSource;
  await assert.rejects(new MediaRepository(db).restore(productId, imageId, 3), { status: 409 });
  assert.ok(!calls.some(sql => /SELECT .*data/i.test(sql) || sql.startsWith('UPDATE')));
});

test('lectura publica y administrativa aplican sus filtros en consulta unica', async () => {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const data = Buffer.from('webp');
  const db = { isInitialized: true, query: async (sql: string, params?: unknown[]) => { calls.push({ sql, params }); return [{ data }]; } } as unknown as DataSource;
  const repo = new MediaRepository(db);
  assert.equal(await repo.readPublic(imageId, 320), data);
  assert.equal(await repo.readAdmin(productId, imageId, 800), data);
  assert.match(calls[0].sql, /i\.retired_at IS NULL.*p\.archived_at IS NULL.*p\.status = 'active'/s);
  assert.deepEqual(calls[1].params, [productId, imageId, 800]);
  assert.equal(calls.length, 2);
});

test('rechaza derivados sobredimensionados antes de insertar', async () => {
  const calls: string[] = [];
  const query = async (sql: string) => {
    calls.push(sql);
    if (sql.includes('SELECT media_revision')) return [{ media_revision: 3, archived_at: null }];
    if (sql.includes('SELECT id, alt') || sql.includes('SELECT id, upload_digest')) return [];
    return [];
  };
  const db = { isInitialized: true, transaction: async (fn: (manager: unknown) => unknown) => fn({ query }) } as unknown as DataSource;
  const repo = new MediaRepository(db);
  await assert.rejects(repo.save(productId, 3, input, { ...derivatives, 320: Buffer.alloc(384 * 1024 + 1) }), { status: 400 });
  await assert.rejects(repo.save(productId, 3, input, { 320: Buffer.alloc(384 * 1024), 800: Buffer.alloc(384 * 1024), 1600: Buffer.alloc(384 * 1024) }), { status: 400 });
  assert.ok(!calls.some(sql => sql.startsWith('INSERT')));
});
