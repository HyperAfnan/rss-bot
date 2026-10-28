import {
  type Client,
  type TextChannel,
  type NewsChannel,
  ThreadAutoArchiveDuration,
  PermissionFlagsBits,
} from "discord.js";
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
  useThread?: boolean;
  discordClient?: Client;
}): Promise<{
  subscription: Subscription;
  feed: ParsedFeed;
  baselineItemCount: number;
  threadId: string | null;
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

  // 5. Create dedicated thread if requested (default: true)
  let createdThreadId: string | null = null;
  const useThread = params.useThread ?? true;

  if (useThread && params.discordClient) {
    try {
      const channel = await params.discordClient.channels.fetch(params.channelId);
      if (channel && channel.isTextBased() && "threads" in channel && "guild" in channel) {
        const textChannel = channel as TextChannel | NewsChannel;

        // Check thread creation permissions
        const botMember = textChannel.guild.members.me ?? (await textChannel.guild.members.fetchMe());
        const perms = textChannel.permissionsFor(botMember);
        if (
          perms?.has(PermissionFlagsBits.CreatePublicThreads) &&
          perms?.has(PermissionFlagsBits.SendMessagesInThreads)
        ) {
          const safeTitle = parsedFeed.title.replace(/[\n\r]/g, " ").trim();
          const threadName = `📢 ${safeTitle.length > 95 ? safeTitle.slice(0, 92) + "..." : safeTitle}`;

          const thread = await textChannel.threads.create({
            name: threadName,
            autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
            reason: `Dedicated thread for ${parsedFeed.title}`,
          });

          await thread.send({
            content: `🧵 **Dedicated Thread for ${parsedFeed.title}**\nAll updates and new articles for this feed will be posted in this thread.\n🔗 **Feed URL:** <${params.feedUrl}>`,
          });

          createdThreadId = thread.id;
          console.log(`[Subscription] Created dedicated thread <#${thread.id}> for ${parsedFeed.title}`);
        } else {
          console.warn(
            `[Subscription] Missing thread permissions in #${textChannel.name}. Falling back to parent channel.`
          );
        }
      }
    } catch (threadErr) {
      console.error("[Subscription] Failed to create dedicated thread:", threadErr);
    }
  }

  // 6. Create subscription record
  const subscription = await createSubscription({
    guildId: params.guildId,
    channelId: params.channelId,
    feedUrl: params.feedUrl,
    threadId: createdThreadId,
    pollIntervalSeconds: pollInterval,
  });

  // 7. Establish baseline items so old articles are NOT spammed
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

  // 8. Initialize feed state with Next Check time and caching headers
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
    threadId: createdThreadId,
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
