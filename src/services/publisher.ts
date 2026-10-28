import {
  Client,
  EmbedBuilder,
  PermissionFlagsBits,
  ThreadAutoArchiveDuration,
  type TextBasedChannel,
  type GuildTextBasedChannel,
  type ThreadChannel,
  type TextChannel,
  type NewsChannel,
} from "discord.js";
import { type ParsedFeedItem } from "../rss/parser";
import { markItemPosted, recordDiscoveredItem } from "../db/repositories/feed-items";
import {
  updateSubscriptionThread,
  type Subscription,
} from "../db/repositories/subscriptions";

export function formatFeedEmbed(
  item: ParsedFeedItem,
  feedTitle?: string
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(0xff7700) // RSS orange
    .setTitle(item.title.length > 256 ? item.title.slice(0, 253) + "..." : item.title);

  if (item.link) {
    embed.setURL(item.link);
  }

  if (item.description) {
    const desc =
      item.description.length > 1000
        ? item.description.slice(0, 997) + "..."
        : item.description;
    embed.setDescription(desc);
  }

  if (item.publishedAt) {
    embed.setTimestamp(item.publishedAt);
  }

  if (item.author) {
    embed.setAuthor({
      name: item.author.length > 256 ? item.author.slice(0, 253) + "..." : item.author,
    });
  }

  if (item.imageUrl) {
    try {
      const imgUrl = new URL(item.imageUrl);
      if (imgUrl.protocol === "http:" || imgUrl.protocol === "https:") {
        embed.setImage(imgUrl.toString());
      }
    } catch {
      // Ignore invalid image URLs
    }
  }

  const footerText = feedTitle ? `Feed: ${feedTitle}` : "RSS Feed";
  embed.setFooter({
    text: footerText.length > 2048 ? footerText.slice(0, 2045) + "..." : footerText,
  });

  return embed;
}

export async function resolveTargetDestination(
  discordClient: Client,
  subscription: Subscription,
  feedTitle?: string
): Promise<GuildTextBasedChannel | ThreadChannel> {
  const channel = await discordClient.channels.fetch(subscription.channel_id);
  if (!channel || !channel.isTextBased() || !("guild" in channel)) {
    throw new Error(`Channel ${subscription.channel_id} is missing or not a guild text channel`);
  }

  const parentChannel = channel as GuildTextBasedChannel;

  // Check bot permissions in parent channel
  const botMember = parentChannel.guild.members.me ?? (await parentChannel.guild.members.fetchMe());
  const permissions = parentChannel.permissionsFor(botMember);

  if (
    !permissions?.has(PermissionFlagsBits.ViewChannel) ||
    !permissions?.has(PermissionFlagsBits.SendMessages) ||
    !permissions?.has(PermissionFlagsBits.EmbedLinks)
  ) {
    throw new Error(
      `Missing required permissions (ViewChannel, SendMessages, EmbedLinks) in channel #${parentChannel.name}`
    );
  }

  // If this subscription has a dedicated thread configured
  if (subscription.thread_id) {
    try {
      const threadChannel = await discordClient.channels.fetch(subscription.thread_id);
      if (threadChannel && threadChannel.isThread()) {
        // Automatically unarchive if archived by Discord due to inactivity
        if (threadChannel.archived) {
          console.log(
            `[Publisher] Unarchiving thread #${threadChannel.name} for subscription ${subscription.id}...`
          );
          await threadChannel.setArchived(false);
        }
        return threadChannel;
      }
    } catch (threadFetchErr) {
      console.warn(
        `[Publisher] Dedicated thread ${subscription.thread_id} missing or deleted for subscription #${subscription.id}. Recreating thread...`,
        threadFetchErr
      );
    }

    // Recreate thread if deleted or missing
    if ("threads" in parentChannel) {
      const threadableChannel = parentChannel as TextChannel | NewsChannel;
      const safeTitle = (feedTitle || "RSS Feed").replace(/[\n\r]/g, " ").trim();
      const threadName = `📢 ${safeTitle.length > 95 ? safeTitle.slice(0, 92) + "..." : safeTitle}`;

      const newThread = await threadableChannel.threads.create({
        name: threadName,
        autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
        reason: `Recreating dedicated thread for subscription #${subscription.id}`,
      });

      await updateSubscriptionThread(subscription.id, newThread.id);
      console.log(
        `[Publisher] Recreated dedicated thread <#${newThread.id}> for subscription #${subscription.id}`
      );
      return newThread;
    }
  }

  return parentChannel;
}

export async function publishItem(
  discordClient: Client,
  subscription: Subscription,
  item: ParsedFeedItem,
  feedTitle?: string
): Promise<boolean> {
  try {
    const targetChannel = await resolveTargetDestination(discordClient, subscription, feedTitle);
    const embed = formatFeedEmbed(item, feedTitle);

    // Record discovered item first with posted_at = NULL
    await recordDiscoveredItem({
      subscriptionId: subscription.id,
      itemKey: item.itemKey,
      itemUrl: item.link,
      title: item.title,
      publishedAt: item.publishedAt,
    });

    // Send to resolved thread or channel
    await targetChannel.send({ embeds: [embed] });

    // Mark as posted now that Discord confirmed message delivery
    await markItemPosted(subscription.id, item.itemKey);

    return true;
  } catch (error) {
    console.error(
      `[Publisher] Failed to publish item "${item.title}" for subscription ${subscription.id}:`,
      error
    );
    throw error;
  }
}
