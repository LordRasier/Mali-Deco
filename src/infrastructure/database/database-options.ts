import type { DataSourceOptions } from 'typeorm';
import { validateDatabaseConfig } from './database-config';
import { CategorySchema, ColorSchema, MaterialSchema, ProductSchema, SettingsSchema, VariantSchema } from '../../modules/catalog/models/catalog.entities';

export function databaseOptions(): DataSourceOptions {
  return {
    type: 'mariadb', ...validateDatabaseConfig(process.env), synchronize: false, timezone: 'Z',
    entities: [ProductSchema, VariantSchema, SettingsSchema, CategorySchema, MaterialSchema, ColorSchema],
    migrations: [__dirname + '/migrations/*{.js,.ts}'],
  };
}
