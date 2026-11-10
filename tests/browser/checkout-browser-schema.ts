/** Validate SHOW FULL TABLES after migrations without weakening the harness allowlist. */
export function assertCheckoutSchema(rows: ReadonlyArray<Record<string, string>>): void {
  const expectedTables = new Set([
    'migrations', 'products', 'product_variants', 'store_settings',
    'admin_users', 'admin_sessions', 'login_attempt_windows',
    'categories', 'materials', 'colors',
    'checkout_sessions', 'checkout_quotes', 'checkout_orders',
    'product_images', 'product_image_derivatives', 'product_image_quota', 'store_brand_assets',
  ]);
  if (rows.length !== expectedTables.size) throw new Error('Unexpected objects after migration');
  for (const row of rows) {
    const [name, kind] = Object.values(row);
    if (kind !== 'BASE TABLE' || !expectedTables.has(name)) throw new Error('Unexpected non-table object after migration');
  }
}
