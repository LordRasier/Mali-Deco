import 'reflect-metadata';
import { StrictDataSource } from './strict-data-source';
import { databaseOptions } from './database-options';
import { PaymentEnvironments1793362600000 } from './migrations/1793362600000-payment-environments';
export default new StrictDataSource({ ...databaseOptions(), migrations: [PaymentEnvironments1793362600000] });
