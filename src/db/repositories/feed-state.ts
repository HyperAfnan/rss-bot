import { getDb } from "../client";

export interface FeedState {
  subscription_id: number;
  etag: string | null;
  last_modified: string | null;
  last_success_at: Date | null;
  next_check_at: Date;
  consecutive_failures: number;
}

export async function upsertFeedState(params: {
  subscriptionId: number;
  etag?: string | null;
  lastModified?: string | null;
  lastSuccessAt?: Date | null;
  nextCheckAt: Date;
  consecutiveFailures?: number;
}): Promise<void> {
  const sql = getDb();
  await sql`
    INSERT INTO feed_state (
      subscription_id,
      etag,
      last_modified,
      last_success_at,
      next_check_at,
      consecutive_failures
    )
    VALUES (
      ${params.subscriptionId},
      ${params.etag ?? null},
      ${params.lastModified ?? null},
      ${params.lastSuccessAt ?? null},
      ${params.nextCheckAt},
      ${params.consecutiveFailures ?? 0}
    )
    ON CONFLICT (subscription_id) DO UPDATE
    SET
      etag = COALESCE(EXCLUDED.etag, feed_state.etag),
      last_modified = COALESCE(EXCLUDED.last_modified, feed_state.last_modified),
      last_success_at = COALESCE(EXCLUDED.last_success_at, feed_state.last_success_at),
      next_check_at = EXCLUDED.next_check_at,
      consecutive_failures = EXCLUDED.consecutive_failures
  `;
}

export async function updateFeedStateSuccess(
  subscriptionId: number,
  etag: string | null,
  lastModified: string | null,
  nextCheckAt: Date
): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE feed_state
    SET
      etag = ${etag},
      last_modified = ${lastModified},
      last_success_at = NOW(),
      next_check_at = ${nextCheckAt},
      consecutive_failures = 0
    WHERE subscription_id = ${subscriptionId}
  `;
}

export async function updateFeedStateFailure(
  subscriptionId: number,
  nextCheckAt: Date
): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE feed_state
    SET
      next_check_at = ${nextCheckAt},
      consecutive_failures = consecutive_failures + 1
    WHERE subscription_id = ${subscriptionId}
  `;
}

export async function getFeedState(
  subscriptionId: number
): Promise<FeedState | null> {
  const sql = getDb();
  const [state] = await sql<FeedState[]>`
    SELECT *
    FROM feed_state
    WHERE subscription_id = ${subscriptionId}
  `;
  return state ?? null;
}

export async function setNextCheckAt(
  subscriptionId: number,
  nextCheckAt: Date
): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE feed_state
    SET next_check_at = ${nextCheckAt}
    WHERE subscription_id = ${subscriptionId}
  `;
}
