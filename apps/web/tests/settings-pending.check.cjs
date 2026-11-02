/* global require, Response, process, console */
/* eslint-disable @typescript-eslint/no-require-imports -- This probe loads TSX with tsx. */
const assert = require('node:assert/strict');
const { hookRunner } = require('./hook-runner.cjs');
require('tsx/cjs');
const React = require('react');
const { sessionStore } = require('../src/admin/session-store.ts');
const { StoreSettings } = require('../src/admin/StoreSettings.tsx');

function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const child of React.Children.toArray(node.props?.children)) {
    const result = find(child, predicate);
    if (result) return result;
  }
  return null;
}

async function main() {
  let finishSave;
  globalThis.fetch = async (url, options = {}) => {
    if (url === '/api/v1/auth/login') return new Response(JSON.stringify({ user: { id: 'owner', email: 'test@example.test', role: 'owner' }, csrf: 'synthetic-csrf' }));
    if (url === '/api/v1/admin/settings' && options.method === 'GET') return new Response(JSON.stringify({ name: 'Inicial' }));
    if (url === '/api/v1/admin/settings' && options.method === 'PUT') return new Promise(resolve => { finishSave = resolve; });
    throw new Error('Unexpected request');
  };
  await sessionStore.login('test@example.test', 'synthetic-password');
  const runner = hookRunner(React, () => StoreSettings());
  let tree = await runner.settle();
  let input = find(tree, node => node.type === 'input');
  assert.equal(input.props.value, 'Inicial');
  input.props.onChange({ target: { value: 'Nombre A' } });
  tree = runner.flush();
  const form = find(tree, node => node.type === 'form');
  const saving = form.props.onSubmit({ preventDefault() {} });
  tree = runner.flush();
  input = find(tree, node => node.type === 'input');
  assert.equal(input.props.disabled, true, 'the input must not accept a newer edit while A is pending');
  assert.equal(input.props.value, 'Nombre A');
  finishSave(new Response(JSON.stringify({ name: 'Nombre A' })));
  await saving;
  tree = await runner.settle();
  input = find(tree, node => node.type === 'input');
  assert.equal(input.props.disabled, false);
  assert.equal(input.props.value, 'Nombre A');
  input.props.onChange({ target: { value: 'Nombre B' } });
  tree = runner.flush();
  assert.equal(find(tree, node => node.type === 'input').props.value, 'Nombre B');
  const failedSave = find(tree, node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  tree = runner.flush();
  assert.equal(find(tree, node => node.type === 'input').props.disabled, true);
  finishSave(new Response('{}', { status: 503 }));
  await failedSave;
  tree = await runner.settle();
  input = find(tree, node => node.type === 'input');
  assert.equal(input.props.disabled, false);
  assert.equal(input.props.value, 'Nombre B');
  assert.ok(find(tree, node => node.props?.role === 'alert'));
  runner.unmount();
}
main().catch(error => { console.error(error); process.exitCode = 1; });
