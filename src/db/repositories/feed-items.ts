import { getDb } from "../client";

export interface FeedItem {
  id: number;
  subscription_id: number;
  item_key: string;
  item_url: string | null;
  title: string | null;
  published_at: Date | null;
  discovered_at: Date;
  posted_at: Date | null;
}

export async function hasItem(subscriptionId: number, itemKey: string): Promise<boolean> {
  const sql = getDb();
  const [result] = await sql<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM feed_items
      WHERE subscription_id = ${subscriptionId} AND item_key = ${itemKey}
    ) as exists
  `;
  return !!result?.exists;
}

/**
 * Record a newly discovered item that is pending Discord publication.
 * Returns true if the item was newly inserted, false if it already existed.
 */
export async function recordDiscoveredItem(params: {
  subscriptionId: number;
  itemKey: string;
  itemUrl?: string | null;
  title?: string | null;
  publishedAt?: Date | null;
}): Promise<boolean> {
  const sql = getDb();
  const result = await sql`
    INSERT INTO feed_items (
      subscription_id,
      item_key,
      item_url,
      title,
      published_at,
      discovered_at,
      posted_at
    )
    VALUES (
      ${params.subscriptionId},
      ${params.itemKey},
      ${params.itemUrl ?? null},
      ${params.title ?? null},
      ${params.publishedAt ?? null},
      NOW(),
      NULL
    )
    ON CONFLICT (subscription_id, item_key) DO NOTHING
    RETURNING id
  `;
  return result.count > 0;
}

/**
 * Record baseline items on subscription creation.
 * Crucial design decision: Marks all existing items with posted_at = NOW()
 * so historical articles are not spammed into the channel.
 */
export async function recordBaselineItems(
  subscriptionId: number,
  items: Array<{
    itemKey: string;
    itemUrl?: string | null;
    title?: string | null;
    publishedAt?: Date | null;
  }>
): Promise<number> {
  if (items.length === 0) return 0;
  const sql = getDb();

  const rows = items.map((item) => ({
    subscription_id: subscriptionId,
    item_key: item.itemKey,
    item_url: item.itemUrl ?? null,
    title: item.title ?? null,
    published_at: item.publishedAt ?? null,
    discovered_at: new Date(),
    posted_at: new Date(), // Baseline items marked as already posted
  }));

  const result = await sql`
    INSERT INTO feed_items ${sql(rows, "subscription_id", "item_key", "item_url", "title", "published_at", "discovered_at", "posted_at")}
    ON CONFLICT (subscription_id, item_key) DO NOTHING
  `;
  return result.count;
}

export async function markItemPosted(
  subscriptionId: number,
  itemKey: string
): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE feed_items
    SET posted_at = NOW()
    WHERE subscription_id = ${subscriptionId} AND item_key = ${itemKey}
  `;
}

export async function getUnpostedItems(
  subscriptionId: number,
  limit = 20
): Promise<FeedItem[]> {
  const sql = getDb();
  return await sql<FeedItem[]>`
    SELECT *
    FROM feed_items
    WHERE subscription_id = ${subscriptionId}
      AND posted_at IS NULL
    ORDER BY discovered_at ASC
    LIMIT ${limit}
  `;
}
