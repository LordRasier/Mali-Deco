import assert from 'node:assert/strict';
import { test } from 'node:test';
import { apiRequest } from '../../src/presentation/admin/client/api.ts';

test('media upload exposes only known error codes paired with their status', async () => {
  const original = globalThis.fetch;
  try {
    for (const [status, message, expected] of [
      [413, 'OUTPUT_TOO_LARGE', 'OUTPUT_TOO_LARGE'],
      [409, 'MEDIA_QUOTA_EXCEEDED', 'MEDIA_QUOTA_EXCEEDED'],
      [503, 'MEDIA_PACKET_TOO_SMALL', 'MEDIA_PACKET_TOO_SMALL'],
      [409, 'OUTPUT_TOO_LARGE', undefined],
      [409, 'sensitive SQL', undefined],
    ]) {
      globalThis.fetch = async () => new globalThis.Response(JSON.stringify({message}), {status});
      await assert.rejects(apiRequest('/admin/catalog/products/example/images', {method:'POST'}), error => {
        assert.equal(error.status,status); assert.equal(error.code,expected); assert.doesNotMatch(error.message,/sensitive SQL/); return true;
      });
    }
  } finally { globalThis.fetch = original; }
});
