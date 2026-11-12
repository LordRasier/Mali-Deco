/** Fixed SQL expression, matching productPrice; never interpolate caller-controlled identifiers. */
export const effectiveVariantPriceSql = '(CASE WHEN v.sale_price_minor IS NOT NULL AND v.sale_price_minor < v.price_minor THEN v.sale_price_minor ELSE v.price_minor END)';
