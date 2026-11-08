import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { StrictDataSource } from '../../src/infrastructure/database/strict-data-source';
import { databaseOptions } from '../../src/infrastructure/database/database-options';
import { MediaRepository } from '../../src/modules/media/persistence/media-repository';
import { ProductImages1793360700000 } from '../../src/infrastructure/database/migrations/1793360700000-product-images';

test('media revisions serialize and retirement is recoverable in an isolated MariaDB', {
  skip: process.env.MEDIA_MARIADB_INTEGRATION !== '1' ? 'requires explicit exclusive media integration flag' : false,
}, async () => {
  if (process.env.DB_HOST !== '127.0.0.1' || process.env.DB_PORT !== '3306' || process.env.DB_DATABASE !== 'store_integration_test' || process.env.DB_USERNAME !== 'root' || process.env.DB_PASSWORD !== '' || process.env.DB_ALLOW_EMPTY_PASSWORD !== '1') throw new Error('Requires the authorized isolated local schema');
  const db = new StrictDataSource({ ...databaseOptions(), extra:{connectionLimit:2} });
  await db.initialize();
  let ownsSchema=false, migrationsComplete=false;
  let connectionIds: number[] = [];
  const productId=randomUUID(), quotaProductId=randomUUID(), firstId=randomUUID(), secondId=randomUUID(), thirdId=randomUUID(), failedId=randomUUID(), quotaId1=randomUUID(), quotaId2=randomUUID(), packetId=randomUUID();
  try {
    const [server] = await db.query('SELECT DATABASE() AS name, VERSION() AS version');
    assert.equal(server.name,'store_integration_test'); assert.match(server.version,/MariaDB/i);
    assert.equal((await db.query('SHOW FULL TABLES')).length,0,'schema must be empty');
    const [objects] = await db.query("SELECT (SELECT COUNT(*) FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA='store_integration_test') AS routines, (SELECT COUNT(*) FROM information_schema.EVENTS WHERE EVENT_SCHEMA='store_integration_test') AS events, (SELECT COUNT(*) FROM information_schema.PROCESSLIST WHERE DB='store_integration_test' AND ID<>CONNECTION_ID()) AS clients");
    assert.deepEqual([Number(objects.routines),Number(objects.events),Number(objects.clients)],[0,0,0]);
    ownsSchema=true;
    const firstConnection=db.createQueryRunner(), secondConnection=db.createQueryRunner();
    try {
      await firstConnection.connect(); await secondConnection.connect();
      const [one]=await firstConnection.query('SELECT CONNECTION_ID() AS id');
      const [two]=await secondConnection.query('SELECT CONNECTION_ID() AS id');
      connectionIds=[Number(one.id),Number(two.id)]; assert.equal(new Set(connectionIds).size,2);
    } finally { await firstConnection.release(); await secondConnection.release(); }
    await db.runMigrations(); migrationsComplete=true;
    await db.query("INSERT INTO products (id,name,description,slug,status) VALUES (?,?,'',?,'active')", [productId,'Synthetic media test',`test-${productId}`]);
    await db.query("INSERT INTO products (id,name,description,slug,status) VALUES (?,?,'',?,'active')", [quotaProductId,'Synthetic quota test',`test-${quotaProductId}`]);
    const repo = new MediaRepository(db), digest='a'.repeat(64), firstKey=randomUUID();
    const derivatives = { 320: Buffer.from('small'), 800: Buffer.from('medium'), 1600: Buffer.from('large') };
    const make = (id:string, uploadKey:string) => ({id,uploadKey,digest,alt:'Imagen sintética',width:100,height:200});
    let inserts = 0;
    const faultDb = {
      isInitialized: true,
      transaction: (fn: (manager: unknown) => Promise<unknown>) => db.transaction(async manager => {
        const proxy = new Proxy(manager, { get(target, property) {
          if (property !== 'query') return Reflect.get(target, property, target);
          return async (sql: string, params?: unknown[]) => {
            if (sql.startsWith('INSERT INTO product_image_derivatives') && ++inserts === 2) throw new Error('induced derivative failure');
            return target.query(sql, params);
          };
        } });
        return fn(proxy);
      }),
    };
    await assert.rejects(new MediaRepository(faultDb as unknown as typeof db).save(productId,0,make(failedId,randomUUID()),derivatives),/induced derivative failure/);
    assert.equal((await repo.list(productId)).revision,0);
    const [failedRows]=await db.query('SELECT (SELECT COUNT(*) FROM product_images WHERE id=?) AS images, (SELECT COUNT(*) FROM product_image_derivatives WHERE image_id=?) AS derivatives',[failedId,failedId]);
    assert.deepEqual([Number(failedRows.images),Number(failedRows.derivatives)],[0,0]);
    const quotaBytes=Object.values(derivatives).reduce((sum, data)=>sum+data.length,0);
    const limitedRepo=new MediaRepository(db,quotaBytes);
    const quotaRace=await Promise.allSettled([
      limitedRepo.save(productId,0,make(quotaId1,randomUUID()),derivatives),
      limitedRepo.save(quotaProductId,0,make(quotaId2,randomUUID()),derivatives),
    ]);
    assert.equal(quotaRace.filter(result=>result.status==='fulfilled').length,1);
    assert.equal(quotaRace.filter(result=>result.status==='rejected' && result.reason?.message==='MEDIA_QUOTA_EXCEEDED').length,1);
    const quotaWinner=quotaRace[0].status==='fulfilled' ? {product:productId,id:quotaId1} : {product:quotaProductId,id:quotaId2};
    // Reset only this identified synthetic fixture so subsequent revision checks start at zero.
    await db.query('DELETE FROM product_image_derivatives WHERE image_id=?',[quotaWinner.id]);
    await db.query('DELETE FROM product_images WHERE id=? AND product_id=?',[quotaWinner.id,quotaWinner.product]);
    await db.query('UPDATE products SET media_revision=0 WHERE id=?',[quotaWinner.product]);
    // Exercise mysql2/TypeORM Buffer encoding against the session packet limit.
    const [packetSetting]=await db.query('SELECT @@SESSION.max_allowed_packet AS bytes');
    assert.equal(Number(packetSetting.bytes),1024*1024,'packet fixture requires the 1 MiB server setting');
    const packetDerivatives={...derivatives,1600:Buffer.alloc(384*1024,0xa5)};
    await repo.save(productId,0,make(packetId,randomUUID()),packetDerivatives);
    assert.deepEqual(await repo.readPublic(packetId,1600),packetDerivatives[1600]);
    const packetRows=await db.query('SELECT id, product_id FROM product_images WHERE id=?',[packetId]);
    assert.deepEqual(packetRows,[{id:packetId,product_id:productId}]);
    const packetRenditions=await db.query('SELECT rendition FROM product_image_derivatives WHERE image_id=? ORDER BY rendition',[packetId]);
    assert.deepEqual(packetRenditions.map((row:{rendition:number})=>row.rendition),[320,800,1600]);
    await db.query('DELETE FROM product_image_derivatives WHERE image_id=?',[packetId]);
    await db.query('DELETE FROM product_images WHERE id=? AND product_id=?',[packetId,productId]);
    await db.query('UPDATE products SET media_revision=0 WHERE id=?',[productId]);
    const one=await repo.save(productId,0,make(firstId,firstKey),derivatives); assert.equal(one.revision,1);
    assert.equal((await repo.save(productId,0,make(randomUUID(),firstKey),derivatives)).imageId,firstId);
    const race=await Promise.allSettled([repo.save(productId,1,make(secondId,randomUUID()),derivatives),repo.save(productId,1,make(thirdId,randomUUID()),derivatives)]);
    assert.equal(race.filter(item=>item.status==='fulfilled').length,1);
    assert.equal(race.filter(item=>item.status==='rejected' && item.reason?.status===412).length,1);
    const current=await repo.list(productId); assert.equal(current.items.length,2);
    const other=current.items.find(item=>item.id!==firstId)!;
    const retired=await repo.retire(productId,firstId,current.revision); assert.equal(retired.items.find(item=>item.id===firstId)?.retired,true);
    assert.equal(await repo.readPublic(firstId,320),null);
    assert.deepEqual(await repo.readAdmin(productId,firstId,320),derivatives[320]);
    const restored=await repo.restore(productId,firstId,retired.revision);
    assert.deepEqual(await repo.readPublic(firstId,320),derivatives[320]);
    const beforeLimit=await repo.list(productId);
    await assert.rejects(new MediaRepository(db,0).save(productId,beforeLimit.revision,make(randomUUID(),randomUUID()),derivatives),{message:'MEDIA_QUOTA_EXCEEDED'});
    assert.deepEqual(await repo.list(productId),beforeLimit);
    assert.deepEqual(restored.items.filter(item=>!item.retired).map(item=>item.id),[other.id,firstId]);
    assert.deepEqual(await repo.publicImageAccess(firstId),{productId});
    const undoProbe = db.createQueryRunner();
    try { await assert.rejects(new ProductImages1793360700000().down(undoProbe), /while images exist/); }
    finally { await undoProbe.release(); }
  } finally {
    if (ownsSchema && migrationsComplete) {
      // Never clean a schema that acquired unrecognized objects or rows.
      const [extra]=await db.query("SELECT (SELECT COUNT(*) FROM information_schema.PROCESSLIST WHERE DB='store_integration_test' AND ID NOT IN (?,?)) AS clients, (SELECT COUNT(*) FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA='store_integration_test') AS routines, (SELECT COUNT(*) FROM information_schema.EVENTS WHERE EVENT_SCHEMA='store_integration_test') AS events", connectionIds);
      assert.deepEqual([Number(extra.clients),Number(extra.routines),Number(extra.events)],[0,0,0]);
      const expected=['admin_sessions','admin_users','categories','checkout_orders','checkout_quotes','checkout_sessions','colors','login_attempt_windows','materials','migrations','product_image_derivatives','product_image_quota','product_images','product_variants','products','store_settings','store_brand_assets'].sort();
      const tables=await db.query('SHOW FULL TABLES');
      assert.deepEqual(tables.map((row:Record<string,string>)=>Object.values(row)[0]).sort(),expected);
      for (const name of expected.filter(name=>!['migrations','products','product_images','product_image_derivatives','product_image_quota'].includes(name))) {
        const [row]=await db.query(`SELECT COUNT(*) AS n FROM \`${name}\``); assert.equal(Number(row.n),0,`unexpected rows in ${name}`);
      }
      const products=await db.query('SELECT id FROM products'); assert.deepEqual(products.map((row:{id:string})=>row.id).sort(),[productId,quotaProductId].sort());
      const images=await db.query('SELECT id FROM product_images WHERE product_id=?',[productId]);
      const expectedIds: string[] = [firstId,secondId,thirdId];
      assert.ok(images.every((row:{id:string})=>expectedIds.includes(row.id)));
      const [allImages]=await db.query('SELECT COUNT(*) AS n FROM product_images'); assert.equal(Number(allImages.n),images.length);
      const history=await db.query('SELECT name FROM migrations ORDER BY id');
      assert.deepEqual(history.map((row:{name:string})=>row.name),['CreateCatalog1793360000000','CatalogCore1793360100000','Identity1793360200000','CanonicalAdminEmail1793360300000','CatalogTaxonomy1793360400000','CheckoutQuotes1793360500000','CheckoutOrders1793360600000','ProductImages1793360700000','StoreBrandAssets1793360800000']);
      const quotaRows=await db.query('SELECT id FROM product_image_quota'); assert.deepEqual(quotaRows.map((row:{id:number})=>row.id),[1]);
      const derivativeRows=await db.query('SELECT image_id, rendition FROM product_image_derivatives');
      assert.equal(derivativeRows.length,images.length*3);
      assert.ok(derivativeRows.every((row:{image_id:string;rendition:number})=>images.some((image:{id:string})=>image.id===row.image_id) && [320,800,1600].includes(row.rendition)));
      for (const image of images) await db.query('DELETE FROM product_image_derivatives WHERE image_id=?',[image.id]);
      await db.query('DELETE FROM product_images WHERE product_id=?',[productId]);
      await db.query('DELETE FROM products WHERE id IN (?,?)',[productId,quotaProductId]);
      const [{n}]=await db.query('SELECT COUNT(*) AS n FROM migrations');
      for (let i=0;i<Number(n);i++) await db.undoLastMigration();
      await db.query('DROP TABLE migrations'); assert.equal((await db.query('SHOW FULL TABLES')).length,0);
    }
    await db.destroy();
  }
});
