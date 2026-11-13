import 'reflect-metadata';
import { StrictDataSource } from './strict-data-source';
import { databaseOptions } from './database-options';
import { CheckoutReservations1793362700000 } from './migrations/1793362700000-checkout-reservations';
export default new StrictDataSource({ ...databaseOptions(), migrations: [CheckoutReservations1793362700000] });
