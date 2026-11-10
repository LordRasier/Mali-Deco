import type { DataSource } from 'typeorm';

/** Serialized transactions with rollback, exercising the published/draft service contract without a listener. */
export function contentDatabase() {
  type Published = { config: string; revision: number };
  type Draft = Published & { base_revision: number; is_draft: number };
  let published: Published | undefined, draft: Draft | undefined, queue: Promise<unknown> = Promise.resolve();
  let failDraftWrite = false;
  const query = async (sql: string, args: unknown[] = []) => {
    if (sql.includes('FROM (SELECT 1 AS id)')) return [{ publishedConfig: published?.config, publishedRevision: published?.revision,
      draftConfig: draft?.config, revision: draft?.revision, baseRevision: draft?.base_revision, isDraft: draft?.is_draft }];
    if (sql.startsWith('INSERT IGNORE INTO store_content_settings')) { published ??= { config: String(args[0]), revision: 0 }; return {}; }
    if (sql.startsWith('INSERT IGNORE INTO store_content_drafts')) { draft ??= { config: String(args[0]), revision: 0, base_revision: Number(args[1]), is_draft: 0 }; return {}; }
    if (sql.startsWith('SELECT')) return sql.includes('store_content_drafts') ? draft ? [{ ...draft }] : [] : published ? [{ ...published }] : [];
    if (sql.startsWith('UPDATE store_content_settings')) {
      if (!published || args.length > 1 && published.revision !== args[1]) return { affectedRows: 0 };
      published = { config: String(args[0]), revision: published.revision + 1 }; return { affectedRows: 1 };
    }
    if (sql.startsWith('UPDATE store_content_drafts')) {
      if (failDraftWrite) throw Error('injected write failure');
      draft = { config: String(args[0]), revision: draft!.revision + 1, base_revision: Number(args[1]), is_draft: Number(args[2]) }; return { affectedRows: 1 };
    }
    throw Error(`Unexpected SQL: ${sql}`);
  };
  const db = { isInitialized: true, query, transaction: <T>(run: (manager: { query: typeof query }) => Promise<T>) => {
    const result = queue.then(async () => {
      const savedPublished = published && { ...published }, savedDraft = draft && { ...draft };
      try { return await run({ query }); } catch (error) { published = savedPublished; draft = savedDraft; throw error; }
    });
    queue = result.catch(() => undefined); return result;
  } } as unknown as DataSource;
  return { db, failDraftWrite: (fail: boolean) => { failDraftWrite = fail; } };
}
