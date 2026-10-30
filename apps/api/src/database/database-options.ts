import type { DataSourceOptions } from 'typeorm';
import { validateDatabaseConfig } from './database-config';
import { ProductSchema, SettingsSchema, VariantSchema } from '../catalog/catalog.entities';

export function databaseOptions(): DataSourceOptions {
  return {
    type: 'mysql', ...validateDatabaseConfig(process.env), synchronize: false, timezone: 'Z',
    entities: [ProductSchema, VariantSchema, SettingsSchema],
    migrations: [__dirname + '/migrations/*{.js,.ts}'],
  };
}
