import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mountSettingsTabs } from '../../src/presentation/admin/client/browser/settings/settings-tabs';

class Element extends EventTarget {
  hidden = false; tabIndex = -1; focused = false;
  attributes = new Map<string, string>();
  constructor(readonly dataset: Record<string, string>) { super(); }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  focus() { this.focused = true; }
}
test('settings tabs support keyboard navigation and retain drafts, selection and listeners correctly', () => {
  const names = ['identity', 'social', 'images', 'emails'];
  const tabs = names.map(name => new Element({ settingsTab: name }));
  const panels = names.map(name => new Element({ settingsPanel: name }));
  const form = new Element({}); const draft = { name: 'Sin guardar', file: { name: 'logo.png' } };
  Object.assign(panels[0], { draft }); tabs[0].setAttribute('aria-selected', 'true');
  const root = { querySelectorAll: (selector: string) => selector === '[data-settings-tab]' ? tabs : panels, querySelector: () => form } as unknown as HTMLElement;
  const controller = mountSettingsTabs(root);
  assert.deepEqual(panels.map(panel => panel.hidden), [false, true, true, true]);
  tabs[1].dispatchEvent(new Event('click')); assert.deepEqual(panels.map(panel => panel.hidden), [true, false, true, true]);
  assert.deepEqual(tabs.map(tab => tab.tabIndex), [-1, 0, -1, -1]); assert.equal(form.hidden, false);
  const key = (index: number, value: string) => { const event = new Event('keydown', { cancelable: true }); Object.assign(event, { key: value }); tabs[index].dispatchEvent(event); return event; };
  assert.equal(key(1, 'End').defaultPrevented, true); assert.equal(form.hidden, true); assert.equal(tabs[3].focused, true);
  key(3, 'ArrowRight'); assert.equal(panels[0].hidden, false); assert.equal(form.hidden, false);
  key(0, 'ArrowLeft'); assert.equal(panels[3].hidden, false); assert.equal(form.hidden, true);
  key(3, 'ArrowLeft'); assert.equal(panels[2].hidden, false); assert.equal(form.hidden, true);
  key(2, 'Home'); assert.equal(panels[0].hidden, false);
  assert.equal((panels[0] as Element & { draft: typeof draft }).draft, draft);
  assert.equal(key(0, 'Tab').defaultPrevented, false);
  controller.select('social'); controller.dispose();
  tabs[0].dispatchEvent(new Event('click')); assert.equal(panels[1].hidden, false);
  const remounted = mountSettingsTabs(root); assert.equal(panels[1].hidden, false); remounted.dispose();
});
