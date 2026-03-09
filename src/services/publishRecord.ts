import { getDatabase } from './database.js';

interface InsertRecord {
  id: string;
  title: string;
  author: string | null;
  media_id: string;
  thumb_media_id: string;
  cover_url: string | null;
  cover_strategy: string;
  theme: string | null;
  digest: string | null;
  enable_comment: number;
  status: string;
  error_message: string | null;
  webhook_status: string | null;
  webhook_url: string | null;
}

export async function insertPublishRecord(record: InsertRecord): Promise<void> {
  const db = getDatabase();
  const now = new Date().toISOString();

  await db.insertInto('publish_records')
    .values({
      ...record,
      created_at: now,
      updated_at: now,
    })
    .execute();
}

export async function updatePublishRecord(
  id: string,
  updates: Partial<{ status: string; error_message: string; webhook_status: string }>
): Promise<void> {
  const db = getDatabase();
  await db.updateTable('publish_records')
    .set({ ...updates, updated_at: new Date().toISOString() })
    .where('id', '=', id)
    .execute();
}

export async function queryPublishRecords(options: {
  page?: number;
  pageSize?: number;
  status?: string;
}): Promise<{ total: number; items: unknown[] }> {
  const db = getDatabase();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 20));
  const offset = (page - 1) * pageSize;

  let countQuery = db.selectFrom('publish_records').select(
    db.fn.countAll<number>().as('count')
  );

  let itemsQuery = db.selectFrom('publish_records')
    .selectAll()
    .orderBy('created_at', 'desc')
    .limit(pageSize)
    .offset(offset);

  if (options.status) {
    countQuery = countQuery.where('status', '=', options.status);
    itemsQuery = itemsQuery.where('status', '=', options.status);
  }

  const [countResult, items] = await Promise.all([
    countQuery.executeTakeFirstOrThrow(),
    itemsQuery.execute(),
  ]);

  return {
    total: Number(countResult.count),
    items: items.map((item) => ({
      publishId: item.id,
      title: item.title,
      author: item.author,
      mediaId: item.media_id,
      coverUrl: item.cover_url,
      coverStrategy: item.cover_strategy,
      theme: item.theme,
      status: item.status,
      webhookStatus: item.webhook_status,
      createdAt: item.created_at,
    })),
  };
}
