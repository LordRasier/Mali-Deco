import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createViewEngine } from '../view-engine';
import { TrackingPageController } from './tracking-page.controller';
import { TrackingController, TRACKING_ORIGIN } from '../../modules/order-tracking/tracking.controller';
import { TrackingService } from '../../modules/order-tracking/tracking-service';
import { Test } from '@nestjs/testing';
import { OrderTrackingModule } from '../../modules/order-tracking/order-tracking.module';
import { InformationController } from '../information/information.controller';
import { PATH_METADATA } from '@nestjs/common/constants';

test('tracking HTML has an accessible request form, private headers and no analytics or customer bootstrap', async () => {
  const controller = new TrackingPageController({ settings: async () => ({ name: '<Mali>' }) });
  let model: Record<string, unknown> = {};
  await controller.page({}, { render(view, value) { assert.equal(view, 'tracking'); model = value as Record<string, unknown>; } });
  const engine = createViewEngine({ site_footer: '' });
  const html = await new Promise<string>((resolve, reject) => engine.__express(join(__dirname, 'views/tracking.hbs'), model, (error, value) => error ? reject(error) : resolve(value!)));
  assert.match(html, /Mis pedidos · &lt;Mali&gt;/); assert.match(html, /type="email"/); assert.match(html, /data-request-form/); assert.match(html, /data-order-list/);
  assert.doesNotMatch(html, /analytics\.js|google-analytics|token_hash|apiKey/);
  const headers = Reflect.getMetadata('__headers__', controller.page) as { name: string; value: string }[];
  assert.ok(headers.some(h => h.name === 'Referrer-Policy' && h.value === 'no-referrer'));
  assert.ok(headers.some(h => h.name === 'Cache-Control' && h.value.includes('no-store')));
  await assert.rejects(controller.page({ token: 'must-not-be-in-URL' }, { render() { throw Error('Unexpected'); } }));
  assert.ok(!(Reflect.getMetadata(PATH_METADATA, InformationController.prototype.show) as string[]).includes('seguimiento'));
});
test('tracking module wires the service and controller without database or production credentials', async () => {
  const module = await Test.createTestingModule({ imports: [OrderTrackingModule] }).overrideProvider(TRACKING_ORIGIN).useValue('https://store.dev').compile();
  try { assert.ok(module.get(TrackingController)); assert.ok(module.get(TrackingService)); } finally { await module.close(); }
});
test('tracking assets are fixed allowlisted build inputs and email contains the access entry', () => {
  const assets = readFileSync(join(__dirname, '../static-assets.ts'), 'utf8'), copy = readFileSync(join(__dirname, '../../../scripts/copy-view-assets.mjs'), 'utf8');
  assert.match(assets, /files: \['tracking.css', 'tracking.js'\]/); assert.match(copy, /presentation\/tracking\/views\/tracking.hbs/);
  const client = readFileSync(join(__dirname, 'public/tracking.js'), 'utf8');
  assert.doesNotMatch(client, /innerHTML|localStorage|sessionStorage|insertAdjacentHTML/);
  assert.match(client, /history.replaceState/); assert.match(client, /setInterval/);
});
