import 'reflect-metadata';
import { StrictDataSource } from './strict-data-source';
import { databaseOptions } from './database-options';
import { StoreSocialLinks1793361500000 } from './migrations/1793361500000-store-social-links';

/** One explicit maintenance command; does not run unrelated pending migrations at startup. */
export default new StrictDataSource({ ...databaseOptions(), migrations: [StoreSocialLinks1793361500000] });
