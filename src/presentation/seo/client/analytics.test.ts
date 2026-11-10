import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mountAnalytics } from './analytics';

class Node extends EventTarget {
  children: Node[] = []; dataset: Record<string, string> = {}; hidden = false; textContent = ''; className = ''; id = ''; type = ''; href = ''; src = ''; nonce = ''; async = false;
  append(...children: Node[]) { this.children.push(...children); }
  setAttribute() {} focus() {}
}
test('GA4 and GTM load once only after consent; rejection and private routes never load scripts', () => {
  const globals = ['document', 'window', 'location', 'localStorage'] as const;
  const original = globals.map(key => Object.getOwnPropertyDescriptor(globalThis, key));
  try {
    for (const mode of ['ga4', 'gtm']) {
      const head = new Node(), body = new Node(), footer = new Node(), script = new Node(), events = new EventTarget();
      script.dataset = { siteAnalytics: mode, measurementId: mode === 'ga4' ? 'G-TEST12345' : 'GTM-TEST123' }; script.nonce = 'test-nonce';
      const storage = new Map<string, string>(); let reloads = 0;
      const location = { href: 'https://shop.example/catalogo?utm_source=instagram&search=private', pathname: '/catalogo', origin: 'https://shop.example', hostname: 'shop.example', reload: () => { reloads++; } };
      const doc = { head, body, referrer: 'https://origin.example/private?email=secret', cookie: '_ga=example', createElement: () => new Node(),
        querySelector: (selector: string) => selector === 'script[data-site-analytics]' ? script : selector === '.site-footer-bottom' ? footer : null,
        addEventListener: events.addEventListener.bind(events) };
      const win = Object.assign(new EventTarget(), { dataLayer: undefined as unknown[] | undefined });
      Object.defineProperties(globalThis, { document: { configurable: true, value: doc }, window: { configurable: true, value: win }, location: { configurable: true, value: location }, localStorage: { configurable: true, value: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) } } });
      mountAnalytics(); assert.equal(head.children.length, 0); assert.equal(win.dataLayer, undefined);
      const panel = body.children[0], controls = panel.children[3], reject = controls.children[0], accept = controls.children[1];
      reject.dispatchEvent(new Event('click')); assert.equal(head.children.length, 0);
      accept.dispatchEvent(new Event('click')); accept.dispatchEvent(new Event('click'));
      assert.equal(head.children.length, 1); assert.equal(head.children[0].nonce, 'test-nonce');
      assert.match(head.children[0].src, mode === 'ga4' ? /gtag\/js\?id=G-TEST12345/ : /gtm.js\?id=GTM-TEST123/);
      const commands = win.dataLayer!.map(item => Array.from(item as ArrayLike<unknown>));
      assert.equal(commands.filter(item => item[0] === 'config').length, mode === 'ga4' ? 1 : 0);
      assert.doesNotMatch(JSON.stringify(win.dataLayer), /search=private|email=secret/);
      reject.dispatchEvent(new Event('click')); assert.equal(reloads, 1); assert.match([...storage.values()][0], /rejected/);
      assert.deepEqual(Array.from(win.dataLayer!.at(-1) as ArrayLike<unknown>).slice(0, 2), ['consent', 'update']);
      head.children.length = 0; location.pathname = '/admin'; mountAnalytics(); assert.equal(head.children.length, 0);
    }
  } finally { globals.forEach((key, i) => { if (original[i]) Object.defineProperty(globalThis, key, original[i]!); else Reflect.deleteProperty(globalThis, key); }); }
});
