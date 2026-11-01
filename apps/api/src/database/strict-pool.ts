/** Callback pool surface used by the pinned TypeORM MariaDB/mysql2 driver. */
export interface Lease {
  query(sql: string, callback: (error: Error | null, rows?: unknown) => void): void;
  destroy(): void;
}
export interface Pool {
  getConnection(callback: (error: Error | null, lease?: Lease) => void): void;
}

/** Every checkout is initialized and verified before it reaches a TypeORM query runner. */
export function guardPool(pool: Pool): void {
  if (!pool || typeof pool.getConnection !== 'function') throw new Error('Unsupported MariaDB connection pool');
  const acquire = pool.getConnection.bind(pool);
  pool.getConnection = callback => acquire((error, lease) => {
    if (error || !lease) return callback(error ?? new Error('MariaDB connection unavailable'));
    let finished = false;
    const fail = () => {
      if (finished) return;
      finished = true;
      try { if (typeof lease.destroy === 'function') lease.destroy(); } catch { /* No unsafe connection is returned. */ }
      callback(new Error('MariaDB session safety validation failed'));
    };
    try {
      lease.query("SET SESSION sql_mode = CONCAT_WS(',', @@SESSION.sql_mode, 'STRICT_TRANS_TABLES')", setError => {
        if (setError) return fail();
        try {
          lease.query('SELECT @@SESSION.sql_mode AS mode, @@SESSION.check_constraint_checks AS checks', (verifyError, rows) => {
            const value = Array.isArray(rows) ? rows[0] : undefined;
            if (verifyError || !value || typeof value.mode !== 'string' || !value.mode.split(',').some((mode: string) => mode === 'STRICT_TRANS_TABLES' || mode === 'STRICT_ALL_TABLES') || Number(value.checks) !== 1) return fail();
            finished = true;
            callback(null, lease);
          });
        } catch { fail(); }
      });
    } catch { fail(); }
  });
}
