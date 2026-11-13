import 'reflect-metadata';
import { StrictDataSource } from './strict-data-source';
import { databaseOptions } from './database-options';
import { HeaderBrandMode1793362900000 } from './migrations/1793362900000-header-brand-mode';

export default new StrictDataSource({ ...databaseOptions(), migrations: [HeaderBrandMode1793362900000] });
