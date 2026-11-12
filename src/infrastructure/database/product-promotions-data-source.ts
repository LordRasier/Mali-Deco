import 'reflect-metadata';
import { StrictDataSource } from './strict-data-source';
import { databaseOptions } from './database-options';
import { ProductPromotions1793362200000 } from './migrations/1793362200000-product-promotions';

/** Explicit maintenance only; never applies unrelated pending migrations. */
export default new StrictDataSource({ ...databaseOptions(), migrations: [ProductPromotions1793362200000] });
