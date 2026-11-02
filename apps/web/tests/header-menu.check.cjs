/* global require */
/* eslint-disable @typescript-eslint/no-require-imports -- The hook probe loads TSX through tsx. */
const assert = require('node:assert/strict');
const { hookRunner } = require('./hook-runner.cjs');
require('tsx/cjs');
const React = require('react');
const { Header } = require('../src/components/Header.tsx');

function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const child of React.Children.toArray(node.props?.children)) {
    const found = find(child, predicate);
    if (found) return found;
  }
  return null;
}

const runner = hookRunner(React, () => Header({ brand: 'Tienda', demo: false, count: 0, onCartOpen() {} }));
let tree = runner.flush();
const firstLink = find(tree, node => node.type === 'a' && node.props.href === '/catalogo');
const menu = find(tree, node => node.type === 'button' && node.props['aria-controls'] === 'main-nav');
let focused = '';
firstLink.props.ref.current = { focus() { focused = 'first link'; } };
menu.props.ref.current = { focus() { focused = 'menu button'; } };
menu.props.onClick();
tree = runner.flush();
assert.equal(focused, 'first link');
assert.equal(find(tree, node => node.type === 'button' && node.props['aria-controls'] === 'main-nav').props['aria-expanded'], true);
let prevented = false;
find(tree, node => node.type === 'header').props.onKeyDown({ key: 'Escape', preventDefault() { prevented = true; } });
tree = runner.flush();
assert.equal(prevented, true);
assert.equal(focused, 'menu button');
assert.equal(find(tree, node => node.type === 'button' && node.props['aria-controls'] === 'main-nav').props['aria-expanded'], false);

find(tree, node => node.type === 'button' && node.props['aria-controls'] === 'main-nav').props.onClick();
tree = runner.flush();
const header = find(tree, node => node.type === 'header');
header.props.onBlur({ currentTarget: { contains: () => true }, relatedTarget: {} });
tree = runner.flush();
assert.equal(find(tree, node => node.type === 'button' && node.props['aria-controls'] === 'main-nav').props['aria-expanded'], true);
find(tree, node => node.type === 'header').props.onBlur({ currentTarget: { contains: () => false }, relatedTarget: {} });
tree = runner.flush();
assert.equal(find(tree, node => node.type === 'button' && node.props['aria-controls'] === 'main-nav').props['aria-expanded'], false);
runner.unmount();
