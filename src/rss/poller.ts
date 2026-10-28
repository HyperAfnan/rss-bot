import { Client } from "discord.js";
import { getConfig } from "../config";
import { fetchFeed } from "./fetcher";
import { parseFeedXml } from "./parser";
import {
  getDueSubscriptions,
  updateSubscriptionStatus,
  type DueSubscription,
} from "../db/repositories/subscriptions";
import {
  updateFeedStateFailure,
  updateFeedStateSuccess,
} from "../db/repositories/feed-state";
import { hasItem, recordDiscoveredItem, markItemPosted } from "../db/repositories/feed-items";
import { publishItem } from "../services/publisher";

export class RssPoller {
  private discordClient: Client;
  private isRunning = false;
  private timer: NodeJS.Timeout | null = null;
  private activePolls = 0;

  constructor(discordClient: Client) {
    this.discordClient = discordClient;
  }

  public start(intervalMs = 20000): void {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log("[Poller] RSS Poller started.");

    const loop = async () => {
      if (!this.isRunning) return;
      try {
        await this.pollDueSubscriptions();
      } catch (err) {
        console.error("[Poller] Error in polling cycle:", err);
      } finally {
        if (this.isRunning) {
          this.timer = setTimeout(loop, intervalMs);
        }
      }
    };

    // Run first poll shortly after start
    this.timer = setTimeout(loop, 2000);
  }

  public stop(): void {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    console.log("[Poller] RSS Poller stopped.");
  }

  public async pollSubscription(sub: DueSubscription): Promise<void> {
    const now = new Date();
    try {
      console.log(`[Poller] Checking feed #${sub.id} (${sub.feed_url})...`);

      const fetchResult = await fetchFeed(sub.feed_url, {
        etag: sub.etag,
        lastModified: sub.last_modified,
      });

      const nextCheckAt = new Date(now.getTime() + sub.poll_interval_seconds * 1000);

      // Handle 304 Not Modified
      if (fetchResult.notModified) {
        console.log(`[Poller] Feed #${sub.id} not modified (304).`);
        await updateFeedStateSuccess(
          sub.id,
          fetchResult.etag,
          fetchResult.lastModified,
          nextCheckAt
        );
        await updateSubscriptionStatus(sub.id, now, null);
        return;
      }

      if (!fetchResult.xml) {
        throw new Error("No XML received from feed source");
      }

      const parsedFeed = parseFeedXml(fetchResult.xml);

      // Items in feed: inspect newest first or oldest first.
      // We publish oldest unposted first so chronological order in channel makes sense.
      const itemsToInspect = [...parsedFeed.items].reverse();
      let publishedCount = 0;

      for (const item of itemsToInspect) {
        const alreadyExists = await hasItem(sub.id, item.itemKey);
        if (!alreadyExists) {
          try {
            await publishItem(this.discordClient, sub, item, parsedFeed.title);
            publishedCount++;
            // Respect Discord rate limits with small pacing
            await new Promise((resolve) => setTimeout(resolve, 500));
          } catch (postErr) {
            console.error(
              `[Poller] Failed to post item ${item.itemKey} for subscription #${sub.id}:`,
              postErr
            );
            // Record as discovered so it's not forgotten, but leave posted_at = NULL
            await recordDiscoveredItem({
              subscriptionId: sub.id,
              itemKey: item.itemKey,
              itemUrl: item.link,
              title: item.title,
              publishedAt: item.publishedAt,
            });
          }
        }
      }

      if (publishedCount > 0) {
        console.log(`[Poller] Published ${publishedCount} new items for feed #${sub.id}.`);
      }

      // Update feed state & subscription success
      await updateFeedStateSuccess(
        sub.id,
        fetchResult.etag,
        fetchResult.lastModified,
        nextCheckAt
      );
      await updateSubscriptionStatus(sub.id, now, null);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[Poller] Feed check failed for #${sub.id}: ${errorMsg}`);

      // Calculate exponential backoff
      const failures = (sub.consecutive_failures ?? 0) + 1;
      const backoffMultiplier = Math.min(Math.pow(1.5, failures), 24); // Cap multiplier
      const backoffSeconds = Math.round(sub.poll_interval_seconds * backoffMultiplier);
      const nextCheckAt = new Date(now.getTime() + backoffSeconds * 1000);

      await updateFeedStateFailure(sub.id, nextCheckAt);
      await updateSubscriptionStatus(sub.id, now, errorMsg);
    }
  }

  private async pollDueSubscriptions(): Promise<void> {
    const config = getConfig();
    const limit = config.CONCURRENT_POLL_LIMIT;
    const dueSubscriptions = await getDueSubscriptions(limit);

    if (dueSubscriptions.length === 0) {
      return;
    }

    console.log(`[Poller] Found ${dueSubscriptions.length} due subscription(s) to poll.`);

    // Concurrently poll with limit
    await Promise.all(
      dueSubscriptions.map((sub) => this.pollSubscription(sub))
    );
  }
}
