import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ContentDrafts, ContentDraftsController, parseDraftRequest } from './content-drafts';
import { ContentSettings } from './content-settings';
import { defaultContentConfig } from './content-config';
import { normalizeSections } from './content-validation';
import { contentDatabase } from '../../../tests/support/content-database';
import { OwnerGuard } from '../identity/http/owner.guard';

test('saving drafts leaves public content and routes intact, publication is atomic and versions never reset', async () => {
  const database = contentDatabase(), published = new ContentSettings(database.db), drafts = new ContentDrafts(published, database.db);
  const initial = await drafts.get(); assert.equal(initial.revision, 0); assert.equal(initial.hasDraft, false);
  const settings = initial.settings; settings.pages.cuidados.enabled = false; settings.footer.description = 'Deckboxes y dados';
  const saved = await drafts.write({ settings, revision: 0, publishedRevision: 0 }, 'draft');
  assert.equal(saved.revision, 1); assert.equal(saved.hasDraft, true);
  assert.equal((await published.get()).settings.pages.cuidados.enabled, true);
  assert.equal((await drafts.get()).settings.pages.cuidados.enabled, false);
  await assert.rejects(drafts.write({ settings, revision: 0, publishedRevision: 0 }, 'publish'), { status: 409 });
  database.failDraftWrite(true);
  await assert.rejects(drafts.write({ settings, revision: 1, publishedRevision: 0 }, 'publish'), /injected/);
  assert.equal((await published.get()).revision, 0); assert.equal((await published.get()).settings.pages.cuidados.enabled, true);
  database.failDraftWrite(false);
  const result = await drafts.write({ settings, revision: 1, publishedRevision: 0 }, 'publish');
  assert.equal(result.revision, 2); assert.equal(result.publishedRevision, 1); assert.equal(result.hasDraft, false);
  assert.equal((await published.get()).settings.pages.cuidados.enabled, false);
  assert.equal((await drafts.get()).revision, 2);
  await assert.rejects(drafts.write({ settings, revision: 1, publishedRevision: 0 }, 'draft'), { status: 409 });
});

test('concurrent tabs and legacy publications cannot silently replace a saved draft', async () => {
  const { db } = contentDatabase(), published = new ContentSettings(db), drafts = new ContentDrafts(published, db);
  const settings = normalizeSections(defaultContentConfig());
  const results = await Promise.allSettled([drafts.write({ settings, revision: 0, publishedRevision: 0 }, 'draft'), drafts.write({ settings, revision: 0, publishedRevision: 0 }, 'draft')]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  settings.footer.description = 'Publicado desde otra sesión';
  await published.set({ settings, revision: 0 });
  assert.equal((await drafts.get()).stale, true);
  await assert.rejects(drafts.write({ settings, revision: 1, publishedRevision: 1 }, 'publish'), { status: 409 });
  const restored = await drafts.write({ revision: 1, publishedRevision: 1 }, 'restore');
  assert.equal(restored.revision, 2); assert.equal(restored.hasDraft, false); assert.equal(restored.settings.footer.description, settings.footer.description);
  assert.equal((await published.get()).revision, 1);
});

test('editor validates versions, content, owner access and missing migration behavior', async () => {
  assert.deepEqual(Reflect.getMetadata('__guards__', ContentDraftsController), [OwnerGuard]);
  for (const body of [{}, { revision: -1, publishedRevision: 0 }, { revision: 0, publishedRevision: 0, extra: true }]) assert.throws(() => parseDraftRequest(body, false));
  const settings = defaultContentConfig(); settings.footer.description = '<script>alert(1)</script>';
  assert.throws(() => parseDraftRequest({ settings, revision: 0, publishedRevision: 0 }, true));
  const drafts = new ContentDrafts(new ContentSettings());
  assert.equal((await drafts.get()).available, false);
  await assert.rejects(drafts.write({ settings: normalizeSections(defaultContentConfig()), revision: 0, publishedRevision: 0 }, 'draft'), { status: 503 });
});
