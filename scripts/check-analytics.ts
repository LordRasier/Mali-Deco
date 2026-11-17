import { analyticsConfig, measurementBody } from '../src/modules/analytics/analytics-model';

// Google's validation endpoint never collects these synthetic events in reports.
async function main() {
  const config = analyticsConfig({ ...process.env, NODE_ENV: 'production', GA4_SERVER_ENABLED: 'true' });
  if (!config.enabled) throw Error('Configure GA4_MEASUREMENT_ID and GA4_API_SECRET in the server environment.');
  const now = Date.now(), identity = { measurementId: config.measurementId, clientId: '123456789.1234567890', sessionId: String(Math.floor(now / 1000) - 10) };
  const commerce = { transaction_id: 'analytics-validation-only', currency: 'ARS', value: 25, shipping: 5, items: [{ item_id: 'validation-product', item_name: 'Validation only', item_variant: 'validation-variant', price: 25, quantity: 1 }] };
  for (const event of ['purchase', 'refund'] as const) {
    const url = new URL('https://www.google-analytics.com/debug/mp/collect');
    url.searchParams.set('measurement_id', config.measurementId); url.searchParams.set('api_secret', config.apiSecret);
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...measurementBody(identity, event, commerce, new Date(now), now), validation_behavior: 'ENFORCE_RECOMMENDATIONS' }), signal: AbortSignal.timeout(10000), redirect: 'error' });
    if (!response.ok) throw Error(`Validation endpoint returned HTTP ${response.status}.`);
    const result = await response.json() as { validationMessages?: { validationCode?: string; fieldPath?: string; description?: string }[] };
    if (!Array.isArray(result.validationMessages)) throw Error('Unexpected validation response.');
    if (result.validationMessages.length) {
      console.error(event, result.validationMessages.map(m => ({ code: m.validationCode, field: m.fieldPath, description: m.description })));
      process.exitCode = 1;
    } else console.log(`${event}: schema accepted by Google validation; no event collected.`);
  }
  console.log('This validates payloads only. It does not prove live ingestion, attribution, or property credentials.');
}
main().catch(() => { console.error('Analytics validation could not finish. Check server variables, network and property secret; no credentials are printed.'); process.exitCode = 1; });
