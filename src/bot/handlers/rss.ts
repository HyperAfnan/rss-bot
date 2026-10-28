import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType,
} from "discord.js";
import {
  addSubscription,
  listSubscriptions,
  pauseSubscription,
  previewFeed,
  removeSubscription,
  resumeSubscription,
  scheduleImmediateCheck,
} from "../../services/subscriptions";
import { formatFeedEmbed } from "../../services/publisher";

export async function handleRssCommand(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({
      content: "This command can only be used inside a Discord server.",
      ephemeral: true,
    });
    return;
  }

  // Authorization check (enforce in backend)
  const memberPermissions = interaction.memberPermissions;
  const isAuthorized =
    memberPermissions?.has(PermissionFlagsBits.ManageGuild) ||
    memberPermissions?.has(PermissionFlagsBits.Administrator);

  if (!isAuthorized) {
    await interaction.reply({
      content: "❌ You need the **Manage Server** permission to manage RSS feeds.",
      ephemeral: true,
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case "add":
      await handleAdd(interaction);
      break;
    case "remove":
      await handleRemove(interaction);
      break;
    case "list":
      await handleList(interaction);
      break;
    case "test":
      await handleTest(interaction);
      break;
    case "pause":
      await handlePause(interaction);
      break;
    case "resume":
      await handleResume(interaction);
      break;
    case "check":
      await handleCheck(interaction);
      break;
    case "status":
      await handleStatus(interaction);
      break;
    default:
      await interaction.reply({
        content: `Unknown subcommand: ${subcommand}`,
        ephemeral: true,
      });
  }
}

async function handleAdd(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const url = interaction.options.getString("url", true).trim();
  const channel = interaction.options.getChannel("channel") ?? interaction.channel;
  const intervalMinutes = interaction.options.getInteger("interval") ?? 10;

  if (!channel || !("isTextBased" in channel) || !channel.isTextBased()) {
    await interaction.editReply({
      content: "❌ Selected destination channel must be a text or announcement channel.",
    });
    return;
  }

  // Verify bot permissions in the target channel
  const botMember = interaction.guild?.members.me ?? (await interaction.guild?.members.fetchMe());
  if (botMember && "permissionsFor" in channel) {
    const permissions = channel.permissionsFor(botMember);
    if (
      !permissions?.has(PermissionFlagsBits.ViewChannel) ||
      !permissions?.has(PermissionFlagsBits.SendMessages) ||
      !permissions?.has(PermissionFlagsBits.EmbedLinks)
    ) {
      await interaction.editReply({
        content: `❌ Missing bot permissions in <#${channel.id}>. Please ensure the bot has **View Channel**, **Send Messages**, and **Embed Links** permissions.`,
      });
      return;
    }
  }

  try {
    const result = await addSubscription({
      guildId: interaction.guildId!,
      guildName: interaction.guild!.name,
      channelId: channel.id,
      feedUrl: url,
      pollIntervalSeconds: intervalMinutes * 60,
    });

    const embed = new EmbedBuilder()
      .setColor(0x57f287) // Green
      .setTitle("✅ RSS Subscription Added")
      .setDescription(`Subscribed to **${result.feed.title}**`)
      .addFields(
        { name: "Subscription ID", value: `#${result.subscription.id}`, inline: true },
        { name: "Channel", value: `<#${channel.id}>`, inline: true },
        { name: "Poll Interval", value: `${intervalMinutes} minutes`, inline: true },
        { name: "Feed URL", value: url },
        {
          name: "Baseline Established",
          value: `Recorded **${result.baselineItemCount}** existing articles. Historical items will not be posted.`,
        }
      )
      .setFooter({ text: "New articles will post automatically to this channel." })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await interaction.editReply({
      content: `❌ Failed to subscribe: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

async function handleRemove(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const id = interaction.options.getInteger("id", true);

  try {
    const removed = await removeSubscription(id, interaction.guildId!);
    if (!removed) {
      await interaction.editReply({
        content: `❌ Subscription #${id} was not found in this server.`,
      });
      return;
    }

    await interaction.editReply({
      content: `✅ Successfully removed subscription #${id}.`,
    });
  } catch (error) {
    await interaction.editReply({
      content: `❌ Error removing subscription: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

async function handleList(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  try {
    const subs = await listSubscriptions(interaction.guildId!);
    if (subs.length === 0) {
      await interaction.editReply({
        content: "No RSS subscriptions configured for this server. Use `/rss add` to add one.",
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865f2) // Blurple
      .setTitle(`RSS Subscriptions (${subs.length})`)
      .setDescription("Configured RSS/Atom feeds for this server:")
      .setTimestamp();

    for (const sub of subs.slice(0, 25)) {
      const statusIcon = !sub.enabled ? "⏸️ Paused" : sub.last_error ? "⚠️ Error" : "🟢 Active";
      const intervalMin = Math.round(sub.poll_interval_seconds / 60);
      const lastCheck = sub.last_checked_at
        ? `<t:${Math.floor(sub.last_checked_at.getTime() / 1000)}:R>`
        : "Never";

      embed.addFields({
        name: `#${sub.id} · <#${sub.channel_id}> [${statusIcon}]`,
        value: `**URL:** ${sub.feed_url}\n**Interval:** Every ${intervalMin}m | **Last check:** ${lastCheck}${
          sub.last_error ? `\n**Error:** \`${sub.last_error.slice(0, 100)}\`` : ""
        }`,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await interaction.editReply({
      content: `❌ Error listing subscriptions: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

async function handleTest(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const url = interaction.options.getString("url", true).trim();

  try {
    const parsedFeed = await previewFeed(url);

    if (parsedFeed.items.length === 0) {
      await interaction.editReply({
        content: `ℹ️ Successfully connected to **${parsedFeed.title}**, but no articles were found to preview.`,
      });
      return;
    }

    const latestItem = parsedFeed.items[0]!;
    const previewEmbed = formatFeedEmbed(latestItem, parsedFeed.title);

    await interaction.editReply({
      content: `🔍 **Previewing latest article from:** ${parsedFeed.title}`,
      embeds: [previewEmbed],
    });
  } catch (error) {
    await interaction.editReply({
      content: `❌ Feed preview failed: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

async function handlePause(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const id = interaction.options.getInteger("id", true);

  try {
    const updated = await pauseSubscription(id, interaction.guildId!);
    if (!updated) {
      await interaction.editReply({
        content: `❌ Subscription #${id} not found in this server.`,
      });
      return;
    }

    await interaction.editReply({
      content: `⏸️ Subscription #${id} has been paused. Automatic polling stopped.`,
    });
  } catch (error) {
    await interaction.editReply({
      content: `❌ Error pausing subscription: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

async function handleResume(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const id = interaction.options.getInteger("id", true);

  try {
    const updated = await resumeSubscription(id, interaction.guildId!);
    if (!updated) {
      await interaction.editReply({
        content: `❌ Subscription #${id} not found in this server.`,
      });
      return;
    }

    await interaction.editReply({
      content: `▶️ Subscription #${id} resumed. Automatic polling will continue.`,
    });
  } catch (error) {
    await interaction.editReply({
      content: `❌ Error resuming subscription: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

async function handleCheck(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const id = interaction.options.getInteger("id", true);

  try {
    await scheduleImmediateCheck(id, interaction.guildId!);
    await interaction.editReply({
      content: `⚡ Manual feed check scheduled for subscription #${id}. It will be checked on the next polling cycle.`,
    });
  } catch (error) {
    await interaction.editReply({
      content: `❌ Error scheduling check: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

async function handleStatus(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const id = interaction.options.getInteger("id");

  try {
    const subs = await listSubscriptions(interaction.guildId!);
    if (subs.length === 0) {
      await interaction.editReply({
        content: "No subscriptions found for this server.",
      });
      return;
    }

    const filtered = id ? subs.filter((s) => s.id === id) : subs;
    if (id && filtered.length === 0) {
      await interaction.editReply({
        content: `❌ Subscription #${id} not found in this server.`,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x00aff4)
      .setTitle(id ? `Status for Subscription #${id}` : "Server Feeds Status Overview")
      .setTimestamp();

    for (const sub of filtered.slice(0, 10)) {
      const state = sub.state;
      const statusText = !sub.enabled
        ? "⏸️ Paused"
        : state && state.consecutive_failures > 0
        ? `⚠️ Failing (${state.consecutive_failures} failures)`
        : "🟢 Operational";

      const lastSuccess = state?.last_success_at
        ? `<t:${Math.floor(state.last_success_at.getTime() / 1000)}:R>`
        : "None";

      const nextCheck = state?.next_check_at
        ? `<t:${Math.floor(state.next_check_at.getTime() / 1000)}:R>`
        : "Pending";

      embed.addFields({
        name: `#${sub.id} · Channel: <#${sub.channel_id}>`,
        value: [
          `**State:** ${statusText}`,
          `**URL:** ${sub.feed_url}`,
          `**Last Success:** ${lastSuccess}`,
          `**Next Check:** ${nextCheck}`,
          `**ETag Caching:** ${state?.etag ? "Active" : "None"}`,
          sub.last_error ? `**Last Error:** \`${sub.last_error.slice(0, 150)}\`` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await interaction.editReply({
      content: `❌ Error retrieving status: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}
