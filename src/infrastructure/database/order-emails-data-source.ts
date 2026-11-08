import 'reflect-metadata';
import { StrictDataSource } from './strict-data-source';
import { databaseOptions } from './database-options';
import { OrderEmailOutbox1793361600000 } from './migrations/1793361600000-order-email-outbox';

export default new StrictDataSource({ ...databaseOptions(), migrations: [OrderEmailOutbox1793361600000] });
