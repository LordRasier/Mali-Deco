import 'reflect-metadata';
import { StrictDataSource } from './strict-data-source';
import { databaseOptions } from './database-options';
import { CommerceAnalytics1793363000000 } from './migrations/1793363000000-commerce-analytics';
export default new StrictDataSource({ ...databaseOptions(), migrations: [CommerceAnalytics1793363000000] });
