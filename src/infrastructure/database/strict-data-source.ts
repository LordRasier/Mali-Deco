import { DataSource, type DataSourceOptions } from 'typeorm';
import { guardPool, type Pool } from './strict-pool';

/** Install the guard before exposing the initialized data source to application callers. */
export class StrictDataSource extends DataSource {
  constructor(options: DataSourceOptions) {
    if (options.type !== 'mariadb' || options.synchronize !== false || options.migrationsRun || options.dropSchema || options.replication) {
      throw new Error('Unsafe MariaDB data source configuration');
    }
    super(options);
  }

  async initialize(): Promise<this> {
    await super.initialize();
    try {
      // TypeORM exposes no session initializer; check the pinned driver shape and fail closed if it changes.
      const driver = this.driver as unknown as { pool?: Pool; poolCluster?: unknown };
      if (driver.poolCluster || !driver.pool) throw new Error('Unsupported MariaDB driver pool');
      guardPool(driver.pool);
      await this.query('SELECT 1');
      return this;
    } catch (error) {
      await this.destroy();
      throw error;
    }
  }
}
