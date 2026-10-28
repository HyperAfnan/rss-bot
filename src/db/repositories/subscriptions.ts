import { getDb } from "../client";

export interface Subscription {
  id: number;
  guild_id: string;
  channel_id: string;
  feed_url: string;
  poll_interval_seconds: number;
  enabled: boolean;
  last_checked_at: Date | null;
  last_error: string | null;
  created_at: Date;
}

export interface DueSubscription extends Subscription {
  etag: string | null;
  last_modified: string | null;
  last_success_at: Date | null;
  next_check_at: Date;
  consecutive_failures: number;
}

export async function createSubscription(params: {
  guildId: string;
  channelId: string;
  feedUrl: string;
  pollIntervalSeconds?: number;
}): Promise<Subscription> {
  const sql = getDb();
  const pollInterval = params.pollIntervalSeconds ?? 600;

  const [sub] = await sql<Subscription[]>`
    INSERT INTO subscriptions (
      guild_id,
      channel_id,
      feed_url,
      poll_interval_seconds,
      enabled
    )
    VALUES (
      ${params.guildId},
      ${params.channelId},
      ${params.feedUrl},
      ${pollInterval},
      true
    )
    RETURNING *
  `;

  if (!sub) {
    throw new Error("Failed to insert subscription");
  }

  return sub;
}

export async function getSubscriptionById(id: number): Promise<Subscription | null> {
  const sql = getDb();
  const [sub] = await sql<Subscription[]>`
    SELECT *
    FROM subscriptions
    WHERE id = ${id}
  `;
  return sub ?? null;
}

export async function findSubscriptionByChannelAndUrl(
  channelId: string,
  feedUrl: string
): Promise<Subscription | null> {
  const sql = getDb();
  const [sub] = await sql<Subscription[]>`
    SELECT *
    FROM subscriptions
    WHERE channel_id = ${channelId} AND feed_url = ${feedUrl}
  `;
  return sub ?? null;
}

export async function listSubscriptionsByGuild(guildId: string): Promise<Subscription[]> {
  const sql = getDb();
  return await sql<Subscription[]>`
    SELECT *
    FROM subscriptions
    WHERE guild_id = ${guildId}
    ORDER BY created_at DESC
  `;
}

export async function deleteSubscription(id: number, guildId: string): Promise<boolean> {
  const sql = getDb();
  const result = await sql`
    DELETE FROM subscriptions
    WHERE id = ${id} AND guild_id = ${guildId}
  `;
  return result.count > 0;
}

export async function setSubscriptionEnabled(
  id: number,
  guildId: string,
  enabled: boolean
): Promise<boolean> {
  const sql = getDb();
  const result = await sql`
    UPDATE subscriptions
    SET enabled = ${enabled}
    WHERE id = ${id} AND guild_id = ${guildId}
  `;
  return result.count > 0;
}

export async function updateSubscriptionStatus(
  id: number,
  lastCheckedAt: Date,
  lastError: string | null
): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE subscriptions
    SET
      last_checked_at = ${lastCheckedAt},
      last_error = ${lastError}
    WHERE id = ${id}
  `;
}

export async function getDueSubscriptions(limit = 10): Promise<DueSubscription[]> {
  const sql = getDb();
  return await sql<DueSubscription[]>`
    SELECT
      s.id,
      s.guild_id,
      s.channel_id,
      s.feed_url,
      s.poll_interval_seconds,
      s.enabled,
      s.last_checked_at,
      s.last_error,
      s.created_at,
      fs.etag,
      fs.last_modified,
      fs.last_success_at,
      fs.next_check_at,
      fs.consecutive_failures
    FROM subscriptions s
    INNER JOIN feed_state fs ON s.id = fs.subscription_id
    WHERE s.enabled = true
      AND fs.next_check_at <= NOW()
    ORDER BY fs.next_check_at ASC
    LIMIT ${limit}
  `;
}
