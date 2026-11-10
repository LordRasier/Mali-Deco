import 'reflect-metadata';
import { StrictDataSource } from './strict-data-source';
import { databaseOptions } from './database-options';
import { StoreContent1793361800000 } from './migrations/1793361800000-store-content';
import { ContentDrafts1793361900000 } from './migrations/1793361900000-content-drafts';
export default new StrictDataSource({ ...databaseOptions(), migrations: [StoreContent1793361800000, ContentDrafts1793361900000] });
