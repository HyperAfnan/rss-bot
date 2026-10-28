import { fetchFeed } from "../rss/fetcher";
import { parseFeedXml, type ParsedFeed } from "../rss/parser";
import { upsertGuild } from "../db/repositories/guilds";
import {
  createSubscription,
  deleteSubscription,
  findSubscriptionByChannelAndUrl,
  getSubscriptionById,
  listSubscriptionsByGuild,
  setSubscriptionEnabled,
  type Subscription,
} from "../db/repositories/subscriptions";
import { recordBaselineItems } from "../db/repositories/feed-items";
import {
  getFeedState,
  setNextCheckAt,
  upsertFeedState,
  type FeedState,
} from "../db/repositories/feed-state";
import { getConfig } from "../config";

export interface SubscriptionWithState extends Subscription {
  state: FeedState | null;
}

export async function addSubscription(params: {
  guildId: string;
  guildName: string;
  channelId: string;
  feedUrl: string;
  pollIntervalSeconds?: number;
}): Promise<{
  subscription: Subscription;
  feed: ParsedFeed;
  baselineItemCount: number;
}> {
  const config = getConfig();
  const pollInterval = Math.max(
    params.pollIntervalSeconds ?? config.POLL_INTERVAL_DEFAULT_SECONDS,
    config.POLL_INTERVAL_MIN_SECONDS
  );

  // 1. Fetch feed to validate URL and check connectivity
  const fetchResult = await fetchFeed(params.feedUrl);
  if (!fetchResult.xml) {
    throw new Error("Unable to retrieve feed content from server");
  }

  // 2. Parse XML to validate format
  const parsedFeed = parseFeedXml(fetchResult.xml);

  // 3. Check for duplicate subscription on this channel
  const existing = await findSubscriptionByChannelAndUrl(params.channelId, params.feedUrl);
  if (existing) {
    throw new Error(`Channel is already subscribed to this feed (Subscription ID: #${existing.id})`);
  }

  // 4. Ensure guild exists in database
  await upsertGuild(params.guildId, params.guildName);

  // 5. Create subscription record
  const subscription = await createSubscription({
    guildId: params.guildId,
    channelId: params.channelId,
    feedUrl: params.feedUrl,
    pollIntervalSeconds: pollInterval,
  });

  // 6. Establish baseline items so old articles are NOT spammed
  const baselineCount = await recordBaselineItems(
    subscription.id,
    parsedFeed.items.map((item) => ({
      itemKey: item.itemKey,
      itemUrl: item.link,
      title: item.title,
      publishedAt: item.publishedAt,
    }))
  );

  console.log(
    `[Subscription] Subscribed #${subscription.id} to ${params.feedUrl}. Established baseline of ${baselineCount} items.`
  );

  // 7. Initialize feed state with Next Check time and caching headers
  const nextCheckAt = new Date(Date.now() + pollInterval * 1000);
  await upsertFeedState({
    subscriptionId: subscription.id,
    etag: fetchResult.etag,
    lastModified: fetchResult.lastModified,
    lastSuccessAt: new Date(),
    nextCheckAt,
  });

  return {
    subscription,
    feed: parsedFeed,
    baselineItemCount: baselineCount,
  };
}

export async function removeSubscription(
  id: number,
  guildId: string
): Promise<boolean> {
  return await deleteSubscription(id, guildId);
}

export async function listSubscriptions(
  guildId: string
): Promise<SubscriptionWithState[]> {
  const subs = await listSubscriptionsByGuild(guildId);
  const result: SubscriptionWithState[] = [];

  for (const sub of subs) {
    const state = await getFeedState(sub.id);
    result.push({
      ...sub,
      state,
    });
  }

  return result;
}

export async function pauseSubscription(
  id: number,
  guildId: string
): Promise<boolean> {
  return await setSubscriptionEnabled(id, guildId, false);
}

export async function resumeSubscription(
  id: number,
  guildId: string
): Promise<boolean> {
  return await setSubscriptionEnabled(id, guildId, true);
}

export async function scheduleImmediateCheck(
  id: number,
  guildId: string
): Promise<Subscription> {
  const sub = await getSubscriptionById(id);
  if (!sub || sub.guild_id !== guildId) {
    throw new Error(`Subscription #${id} not found in this server.`);
  }

  await setNextCheckAt(sub.id, new Date());
  return sub;
}

export async function previewFeed(feedUrl: string): Promise<ParsedFeed> {
  const fetchResult = await fetchFeed(feedUrl);
  if (!fetchResult.xml) {
    throw new Error("Unable to retrieve feed content");
  }
  return parseFeedXml(fetchResult.xml);
}
