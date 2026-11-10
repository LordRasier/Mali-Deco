import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { createViewEngine, type ViewEngine } from './view-engine';

async function fixture(run: (views: string) => Promise<void>) {
  const views = await mkdtemp(join(tmpdir(), 'mali-mvc-engine-'));
  try {
    await writeFile(join(views, 'layout.hbs'), '<main>{{{body}}}</main>');
    await writeFile(join(views, 'page.hbs'), '{{> notice}}<p>{{message}}</p>');
    await run(views);
  } finally {
    assert.equal(dirname(resolve(views)), resolve(tmpdir()));
    await rm(views, { recursive: true, force: true });
  }
}

function render(engine: ViewEngine, views: string, data: Record<string, unknown>) {
  data.settings = { views };
  data.layout = 'layout';
  return new Promise<string>((resolve, reject) => {
    engine.__express(join(views, 'page.hbs'), data, (error, html) => {
      if (error) reject(error);
      else if (typeof html !== 'string') reject(new Error('Missing rendered HTML'));
      else resolve(html);
    });
  });
}

test('view engine composes a layout and partial while escaping untrusted text', async () => {
  await fixture(async views => {
    const engine = createViewEngine({ notice: '<aside>Development only</aside>' });
    const payload = '<script>alert("x")</script><img src=x onerror=alert(1)>';
    const html = await render(engine, views, { message: payload });
    assert.ok(html.startsWith('<main><aside>Development only</aside>'));
    assert.ok(html.includes('&lt;script&gt;'));
    assert.ok(!html.includes(payload));
    assert.ok(!html.includes('<script>'));
  });
});

test('view engine blocks inherited properties and does not invoke inherited methods', async () => {
  await fixture(async views => {
    const engine = createViewEngine({ notice: '' });
    const inherited = Object.create({ message: 'prototype-secret' }) as Record<string, unknown>;
    assert.ok(!(await render(engine, views, inherited)).includes('prototype-secret'));
    let calls = 0;
    const method = Object.create({ message() { calls++; return 'method-secret'; } }) as Record<string, unknown>;
    assert.ok(!(await render(engine, views, method)).includes('method-secret'));
    assert.equal(calls, 0);
  });
});

test('view engine instances do not share partial registrations', async () => {
  await fixture(async views => {
    const first = createViewEngine({ notice: 'first-instance' });
    const second = createViewEngine({ notice: 'second-instance' });
    const [a, b] = await Promise.all([render(first, views, { message: 'a' }), render(second, views, { message: 'b' })]);
    assert.ok(a.includes('first-instance') && !a.includes('second-instance'));
    assert.ok(b.includes('second-instance') && !b.includes('first-instance'));
  });
});
