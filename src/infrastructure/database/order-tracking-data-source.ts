import 'reflect-metadata';
import { StrictDataSource } from './strict-data-source';
import { databaseOptions } from './database-options';
import { OrderTracking1793362800000 } from './migrations/1793362800000-order-tracking';

export default new StrictDataSource({ ...databaseOptions(), migrations: [OrderTracking1793362800000] });
