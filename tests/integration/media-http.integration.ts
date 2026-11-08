import 'reflect-metadata';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { Module, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import sharp from 'sharp';
import { StrictDataSource } from '../../src/infrastructure/database/strict-data-source';
import { databaseOptions } from '../../src/infrastructure/database/database-options';
import { CatalogGuard } from '../../src/modules/identity/http/catalog.guard';
import { AdminMediaController, PublicMediaController } from '../../src/modules/media/http/media.controller';
import { MediaUploadInterceptor } from '../../src/modules/media/http/media-upload.interceptor';
import { MediaRepository } from '../../src/modules/media/persistence/media-repository';
import { MediaService } from '../../src/modules/media/services/media-service';

// This isolated harness replaces only authentication. It is never part of AppModule.
@Module({}) class MediaHttpTestModule {}
const digest = (data: Buffer) => createHash('sha256').update(data).digest('hex');

test('HTTP media survives a Nest restart, retirement and restoration', {
  skip: process.env.MEDIA_HTTP_INTEGRATION !== '1' ? 'requires explicit exclusive media HTTP integration flag' : false,
}, async () => {
  if (process.env.DB_HOST !== '127.0.0.1' || process.env.DB_PORT !== '3306' || process.env.DB_DATABASE !== 'store_integration_test' || process.env.DB_USERNAME !== 'root' || process.env.DB_PASSWORD !== '' || process.env.DB_ALLOW_EMPTY_PASSWORD !== '1') throw new Error('Requires the authorized isolated local schema');
  const newDataSource = () => new StrictDataSource({ ...databaseOptions(), extra: { connectionLimit: 2 } });
  let db = newDataSource();
  await db.initialize();
  const productId = randomUUID(); let imageId: string | undefined; let app: INestApplication | undefined;
  let ownsSchema = false, migrationsComplete = false; let connectionIds: number[] = [];
  async function start(): Promise<string> {
    const testing = await Test.createTestingModule({
      imports: [MediaHttpTestModule], controllers: [AdminMediaController, PublicMediaController],
      providers: [MediaUploadInterceptor, { provide: CatalogGuard, useValue: { canActivate: () => true } },
        { provide: MediaRepository, useValue: new MediaRepository(db) },
        { provide: MediaService, useFactory: (repo: MediaRepository) => new MediaService(repo), inject: [MediaRepository] }],
    }).overrideGuard(CatalogGuard).useValue({ canActivate: () => true }).compile();
    app = testing.createNestApplication(); await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    assert.ok(address && typeof address !== 'string');
    return `http://127.0.0.1:${address.port}`;
  }
  try {
    const [server] = await db.query('SELECT DATABASE() AS name, VERSION() AS version');
    assert.equal(server.name, 'store_integration_test'); assert.match(server.version, /MariaDB/i);
    assert.equal((await db.query('SHOW FULL TABLES')).length, 0, 'schema must be empty');
    const [objects] = await db.query("SELECT (SELECT COUNT(*) FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA='store_integration_test') AS routines, (SELECT COUNT(*) FROM information_schema.EVENTS WHERE EVENT_SCHEMA='store_integration_test') AS events, (SELECT COUNT(*) FROM information_schema.PROCESSLIST WHERE DB='store_integration_test' AND ID<>CONNECTION_ID()) AS clients");
    assert.deepEqual([Number(objects.routines), Number(objects.events), Number(objects.clients)], [0, 0, 0]);
    ownsSchema = true;
    const first = db.createQueryRunner(), second = db.createQueryRunner();
    try {
      await first.connect(); await second.connect();
      const [one] = await first.query('SELECT CONNECTION_ID() AS id'); const [two] = await second.query('SELECT CONNECTION_ID() AS id');
      connectionIds = [Number(one.id), Number(two.id)]; assert.equal(new Set(connectionIds).size, 2);
    } finally { await first.release(); await second.release(); }
    await db.runMigrations(); migrationsComplete = true;
    await db.query("INSERT INTO products (id,name,description,slug,status) VALUES (?,?,'',?,'active')", [productId, 'Synthetic HTTP media', `test-${productId}`]);
    let base = await start(); const admin = `/admin/catalog/products/${productId}/images`;
    const png = await sharp({ create: { width: 32, height: 24, channels: 3, background: '#a24f82' } }).png().toBuffer();
    const form = new FormData(); form.append('file', new Blob([new Uint8Array(png)], { type: 'image/png' }), 'synthetic.png'); form.append('alt', 'Synthetic image');
    const upload = await fetch(base + admin, { method: 'POST', headers: { 'If-Match': '0', 'Idempotency-Key': randomUUID() }, body: form });
    assert.equal(upload.status, 201, await upload.clone().text());
    const created = await upload.json() as { imageId: string; revision: number };
    imageId = created.imageId; assert.match(imageId, /^[0-9a-f-]{36}$/i); assert.equal(created.revision, 1);
    const preview = await fetch(`${base}${admin}/${imageId}/content?w=320`);
    assert.equal(preview.status, 200); assert.match(preview.headers.get('content-type') ?? '', /^image\/webp/);
    const initialHash = digest(Buffer.from(await preview.arrayBuffer()));
    const listing = await fetch(base + admin); assert.equal(listing.status, 200);
    const listText = await listing.text(); const list = JSON.parse(listText) as { items: unknown[] };
    assert.equal(list.items.length, 1); assert.doesNotMatch(listText, /"(?:buffer|data|bytes|blob|derivatives)"/i);
    // Dispose both the HTTP server and its database pool, then create a fresh pool.
    // This restarts Nest and database connections in the same Node process.
    await app!.close(); app = undefined;
    const oldConnectionIds = connectionIds;
    await db.destroy();
    db = newDataSource();
    await db.initialize();
    const reconnectOne = db.createQueryRunner(), reconnectTwo = db.createQueryRunner();
    try {
      await reconnectOne.connect(); await reconnectTwo.connect();
      const [one] = await reconnectOne.query('SELECT CONNECTION_ID() AS id');
      const [two] = await reconnectTwo.query('SELECT CONNECTION_ID() AS id');
      connectionIds = [Number(one.id), Number(two.id)];
      assert.equal(new Set(connectionIds).size, 2);
      assert.ok(connectionIds.every(id => !oldConnectionIds.includes(id)), 'reconnected pool must use new server connections');
      const [extra] = await reconnectOne.query("SELECT COUNT(*) AS clients FROM information_schema.PROCESSLIST WHERE DB='store_integration_test' AND ID NOT IN (?,?)", connectionIds);
      assert.equal(Number(extra.clients), 0, 'schema acquired an unexpected client during restart');
    } finally { await reconnectOne.release(); await reconnectTwo.release(); }
    base = await start();
    const publicPath = `/catalog/images/${imageId}?w=320`;
    const read = async () => { const response = await fetch(base + publicPath); assert.equal(response.status, 200); return digest(Buffer.from(await response.arrayBuffer())); };
    assert.equal(await read(), initialHash);
    const retired = await fetch(`${base}${admin}/${imageId}`, { method: 'DELETE', headers: { 'If-Match': '1' } });
    assert.equal(retired.status, 200); assert.equal((await fetch(base + publicPath)).status, 404);
    const restored = await fetch(`${base}${admin}/${imageId}/restore`, { method: 'POST', headers: { 'If-Match': '2' } });
    assert.equal(restored.status, 201); assert.equal(await read(), initialHash);
  } finally {
    try {
      if (app) await app.close();
      if (ownsSchema && migrationsComplete && db.isInitialized && connectionIds.length === 2) {
        const [extra] = await db.query("SELECT (SELECT COUNT(*) FROM information_schema.PROCESSLIST WHERE DB='store_integration_test' AND ID NOT IN (?,?)) AS clients, (SELECT COUNT(*) FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA='store_integration_test') AS routines, (SELECT COUNT(*) FROM information_schema.EVENTS WHERE EVENT_SCHEMA='store_integration_test') AS events", connectionIds);
        assert.deepEqual([Number(extra.clients), Number(extra.routines), Number(extra.events)], [0, 0, 0]);
        const expected = ['admin_sessions','admin_users','categories','checkout_orders','checkout_quotes','checkout_sessions','colors','login_attempt_windows','materials','migrations','product_image_derivatives','product_image_quota','product_images','product_variants','products','store_settings','store_brand_assets'].sort();
        const tables = await db.query('SHOW FULL TABLES'); assert.deepEqual(tables.map((row: Record<string,string>) => Object.values(row)[0]).sort(), expected);
        for (const name of expected.filter(name => !['migrations','products','product_images','product_image_derivatives','product_image_quota'].includes(name))) {
          const [row] = await db.query(`SELECT COUNT(*) AS n FROM \`${name}\``); assert.equal(Number(row.n), 0, `unexpected rows in ${name}`);
        }
        const products = await db.query('SELECT id FROM products'); assert.deepEqual(products.map((row: {id:string}) => row.id), [productId]);
        const images = await db.query('SELECT id, product_id FROM product_images');
        assert.ok(images.every((row: {id:string;product_id:string}) => row.product_id === productId && row.id === imageId));
        const derivatives = await db.query('SELECT image_id, rendition FROM product_image_derivatives');
        assert.equal(derivatives.length, images.length * 3);
        assert.ok(derivatives.every((row: {image_id:string;rendition:number}) => row.image_id === imageId && [320,800,1600].includes(row.rendition)));
        const history = await db.query('SELECT name FROM migrations ORDER BY id');
        assert.deepEqual(history.map((row: {name:string}) => row.name), ['CreateCatalog1793360000000','CatalogCore1793360100000','Identity1793360200000','CanonicalAdminEmail1793360300000','CatalogTaxonomy1793360400000','CheckoutQuotes1793360500000','CheckoutOrders1793360600000','ProductImages1793360700000','StoreBrandAssets1793360800000']);
        const quota = await db.query('SELECT id FROM product_image_quota'); assert.deepEqual(quota.map((row: {id:number}) => row.id), [1]);
        if (imageId) { await db.query('DELETE FROM product_image_derivatives WHERE image_id=?', [imageId]); await db.query('DELETE FROM product_images WHERE id=? AND product_id=?', [imageId, productId]); }
        await db.query('DELETE FROM products WHERE id=?', [productId]);
        for (let i = 0; i < history.length; i++) await db.undoLastMigration();
        await db.query('DROP TABLE migrations'); assert.equal((await db.query('SHOW FULL TABLES')).length, 0);
      }
    } finally { if (db.isInitialized) await db.destroy(); }
  }
});
