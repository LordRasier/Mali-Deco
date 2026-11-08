import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderCartChrome } from '../../src/presentation/cart/client/browser/cart-chrome';

class Control {
  hidden = false;
  attributes = new Map<string, string>();
  textContent = '';
  setAttribute(key: string, value: string) { this.attributes.set(key, value); }
}
function controls() {
  const trigger = new Control(), badge = new Control(), empty = new Control(), filled = new Control();
  Object.defineProperty(trigger, 'textContent', { set() { throw Error('Do not replace the icon subtree'); } });
  return { nodes: { trigger, badge, empty, filled }, ports: {
    trigger: trigger as unknown as HTMLButtonElement, badge: badge as unknown as HTMLElement,
    empty: empty as unknown as HTMLElement, filled: filled as unknown as HTMLElement,
  } };
}

test('cart icon keeps its subtree and exposes an exact accessible count with a compact visual badge', () => {
  const { nodes, ports } = controls();
  renderCartChrome({ ready: true, count: 1, items: [{}] }, ports);
  assert.equal(nodes.trigger.attributes.get('aria-label'), 'Abrir carrito, 1 unidad');
  assert.equal(nodes.badge.textContent, '1'); assert.equal(nodes.badge.hidden, false);
  renderCartChrome({ ready: true, count: 125, items: [{}] }, ports);
  assert.equal(nodes.trigger.attributes.get('aria-label'), 'Abrir carrito, 125 unidades');
  assert.equal(nodes.badge.textContent, '99+');
});

test('empty and loading carts never display the shipping and totals form', () => {
  const { nodes, ports } = controls();
  renderCartChrome({ ready: false, count: 0, items: [] }, ports);
  assert.equal(nodes.empty.hidden, true); assert.equal(nodes.filled.hidden, true);
  renderCartChrome({ ready: true, count: 0, items: [] }, ports);
  assert.equal(nodes.empty.hidden, false); assert.equal(nodes.filled.hidden, true); assert.equal(nodes.badge.hidden, true);
  renderCartChrome({ ready: true, count: 2, items: [{}] }, ports);
  assert.equal(nodes.empty.hidden, true); assert.equal(nodes.filled.hidden, false);
  renderCartChrome({ ready: true, count: 0, items: [] }, ports);
  assert.equal(nodes.empty.hidden, false); assert.equal(nodes.filled.hidden, true);
});
