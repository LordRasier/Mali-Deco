import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SecretInput } from './secret-input';

test('preserves split UTF-8 input and backspace without echo', () => {
  const input = new SecretInput();
  const bytes = Buffer.from('á');
  assert.deepEqual(input.feed(bytes.subarray(0, 1)), { done: false });
  assert.deepEqual(input.feed(Buffer.concat([bytes.subarray(1), Buffer.from('bc\bX\r')])), { done: true, value: 'ábX' });
});

test('rejects oversized passwords and control sequences instead of truncating them', () => {
  const input = new SecretInput();
  input.feed(Buffer.from('x'.repeat(1025)));
  assert.throws(() => input.feed(Buffer.from('\r')), /Invalid secret/);
  const multi = new SecretInput();
  multi.feed(Buffer.from('á'.repeat(513)));
  assert.throws(() => multi.feed(Buffer.from('\r')), /Invalid secret/);
  const escaped = new SecretInput();
  assert.throws(() => escaped.feed(Buffer.from('password\u001b[A\r')), /Invalid secret/);
  assert.throws(() => new SecretInput().feed(Buffer.from('\u0003')), /Cancelled/);
});
