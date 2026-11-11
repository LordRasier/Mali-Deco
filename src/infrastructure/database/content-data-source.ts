import 'reflect-metadata';
import { StrictDataSource } from './strict-data-source';
import { databaseOptions } from './database-options';
import { StoreContent1793361800000 } from './migrations/1793361800000-store-content';
import { ContentDrafts1793361900000 } from './migrations/1793361900000-content-drafts';
import { ContentMedia1793362000000 } from './migrations/1793362000000-content-media';
import { CategoryPresentation1793362100000 } from './migrations/1793362100000-category-presentation';
export default new StrictDataSource({ ...databaseOptions(), migrations: [StoreContent1793361800000, ContentDrafts1793361900000, ContentMedia1793362000000, CategoryPresentation1793362100000] });
