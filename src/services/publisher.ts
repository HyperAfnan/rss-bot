import {
  Client,
  EmbedBuilder,
  PermissionFlagsBits,
  type TextBasedChannel,
  type GuildTextBasedChannel,
} from "discord.js";
import { type ParsedFeedItem } from "../rss/parser";
import { markItemPosted, recordDiscoveredItem } from "../db/repositories/feed-items";
import { type Subscription } from "../db/repositories/subscriptions";

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

export async function publishItem(
  discordClient: Client,
  subscription: Subscription,
  item: ParsedFeedItem,
  feedTitle?: string
): Promise<boolean> {
  try {
    const channel = await discordClient.channels.fetch(subscription.channel_id);
    if (!channel || !channel.isTextBased()) {
      throw new Error(`Channel ${subscription.channel_id} is missing or not a text channel`);
    }

    const textChannel = channel as GuildTextBasedChannel;

    // Check bot permissions in target channel if guild channel
    if ("guild" in textChannel && textChannel.guild) {
      const botMember = textChannel.guild.members.me ?? (await textChannel.guild.members.fetchMe());
      const permissions = textChannel.permissionsFor(botMember);

      if (
        !permissions.has(PermissionFlagsBits.ViewChannel) ||
        !permissions.has(PermissionFlagsBits.SendMessages) ||
        !permissions.has(PermissionFlagsBits.EmbedLinks)
      ) {
        throw new Error(
          `Missing required permissions (ViewChannel, SendMessages, EmbedLinks) in channel #${textChannel.name}`
        );
      }
    }

    const embed = formatFeedEmbed(item, feedTitle);

    // Record discovered item first with posted_at = NULL
    await recordDiscoveredItem({
      subscriptionId: subscription.id,
      itemKey: item.itemKey,
      itemUrl: item.link,
      title: item.title,
      publishedAt: item.publishedAt,
    });

    // Send to Discord
    await textChannel.send({ embeds: [embed] });

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
