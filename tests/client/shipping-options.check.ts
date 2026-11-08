import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mountShippingOptions } from '../../src/presentation/shipping/client/browser/shipping-options';
import type { ShippingOption } from '../../src/presentation/shared/shipping/shipping-client';

class NodePort extends EventTarget {
  children: NodePort[] = []; attributes = new Map<string, string>();
  textContent = ''; className = ''; type = ''; name = ''; value = ''; checked = false; hidden = false; open = false;
  constructor(readonly tagName: string) { super(); }
  set innerHTML(_value: string) { throw Error('Untrusted HTML'); }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  append(...nodes: NodePort[]) { this.children.push(...nodes); }
  replaceChildren(...nodes: NodePort[]) { this.children = nodes; }
  contains(node: NodePort) { return walk(this).includes(node); }
}
const walk = (node: NodePort): NodePort[] => [node, ...node.children.flatMap(walk)];
const option: ShippingOption = { carrierId: 1, carrierName: '<b>Correo</b>', serviceCode: 'standard_delivery', serviceName: 'A domicilio', logisticType: 'carrier_dropoff', amountMinor: '936824', currency: 'ARS' };
function fixture(run: (root: NodePort, document: {activeElement: NodePort | null}) => void) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const document = { createElement: (tag: string) => new NodePort(tag), activeElement: null as NodePort | null };
  Object.defineProperty(globalThis, 'document', {configurable: true, value: document});
  try { run(new NodePort('fieldset'), document); }
  finally { if (previous) Object.defineProperty(globalThis, 'document', previous); else Reflect.deleteProperty(globalThis, 'document'); }
}

test('groups live services, collapses extras, and preserves exact provider indices and safe text', () => fixture(root => {
  const selections: unknown[] = [];
  const renderer = mountShippingOptions(root as unknown as HTMLFieldSetElement, (index, point) => selections.push([index, point]), () => {});
  const choices = [2, 4, 6].map(index => ({index, option}));
  renderer.update(choices, '2');
  const nodes = walk(root), radios = nodes.filter(node => node.type === 'radio');
  assert.equal(root.hidden, false); assert.equal(radios.length, 3); assert.equal(radios[0].checked, true);
  assert.ok(nodes.some(node => node.textContent === 'Envío a domicilio'));
  assert.ok(nodes.some(node => node.textContent === '<b>Correo</b>'));
  assert.ok(nodes.some(node => /9\.368,24/.test(node.textContent)));
  const more = nodes.find(node => node.tagName === 'details')!;
  assert.equal(more.open, false); assert.ok(walk(more).includes(radios[2]));
  radios[2].checked = true; radios[2].dispatchEvent(new Event('change'));
  assert.deepEqual(selections, [[6, undefined]]);
  renderer.update(choices, '6'); assert.ok(walk(root).includes(radios[2])); assert.equal(radios[0].checked, false); assert.equal(more.open, true);
}));

test('pickup requires explicit branch selection, preserves focus and hides invalidated quotes', () => fixture((root, document) => {
  const selections: unknown[] = []; let restored = 0;
  const renderer = mountShippingOptions(root as unknown as HTMLFieldSetElement, (index, point) => selections.push([index, point]), () => {restored++;});
  const choices = [{index: 7, option: {...option, serviceCode: 'pickup_point', pickupPoints: [{id: 91, description: 'Sucursal <img onerror=bad>'}, {id: 92, description: 'Otra sucursal'}]}}];
  renderer.update(choices, null);
  const radios = walk(root).filter(node => node.type === 'radio');
  assert.equal(radios.length, 2); assert.ok(radios.every(node => !node.checked)); assert.deepEqual(selections, []);
  radios[1].checked = true; radios[1].dispatchEvent(new Event('change')); assert.deepEqual(selections, [[7, 92]]);
  document.activeElement = radios[1]; renderer.update(choices, '7:92'); assert.equal(restored, 0); assert.ok(walk(root).includes(radios[1]));
  renderer.update([], null); assert.equal(root.hidden, true); assert.equal(restored, 1); assert.equal(walk(root).filter(node => node.type === 'radio').length, 0);
}));
