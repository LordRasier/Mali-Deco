import 'reflect-metadata';
import { StrictDataSource } from './strict-data-source';
import { databaseOptions } from './database-options';
import { SiteSeo1793361700000 } from './migrations/1793361700000-site-seo';
export default new StrictDataSource({ ...databaseOptions(), migrations: [SiteSeo1793361700000] });
