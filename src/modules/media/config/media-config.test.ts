import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mediaQuota } from './media-config';

test('quota defaults to 128 MiB and accepts only explicit bounded integer bytes', () => {
  assert.equal(mediaQuota({}), 128 * 1024 * 1024);
  assert.equal(mediaQuota({MEDIA_STORAGE_QUOTA_BYTES:'1048576'}),1048576);
  for (const value of ['', '0', '-1', '1.5', ' 123', '1073741825', '999999999999999999999']) {
    assert.throws(() => mediaQuota({MEDIA_STORAGE_QUOTA_BYTES:value}), /Invalid MEDIA_STORAGE_QUOTA_BYTES/);
  }
});
