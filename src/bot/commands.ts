import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  REST,
  Routes,
} from "discord.js";

export const rssCommand = new SlashCommandBuilder()
  .setName("rss")
  .setDescription("Manage RSS and Atom feed subscriptions")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .setDMPermission(false)
  // Subcommand: add
  .addSubcommand((sub) =>
    sub
      .setName("add")
      .setDescription("Subscribe a channel to an RSS/Atom feed")
      .addStringOption((opt) =>
        opt
          .setName("url")
          .setDescription("The RSS or Atom feed URL")
          .setRequired(true)
      )
      .addChannelOption((opt) =>
        opt
          .setName("channel")
          .setDescription("Destination channel for feed updates (default: current channel)")
          .addChannelTypes(
            ChannelType.GuildText,
            ChannelType.GuildAnnouncement
          )
          .setRequired(false)
      )
      .addIntegerOption((opt) =>
        opt
          .setName("interval")
          .setDescription("Polling interval in minutes (min: 1, default: 10)")
          .setMinValue(1)
          .setMaxValue(1440)
          .setRequired(false)
      )
  )
  // Subcommand: remove
  .addSubcommand((sub) =>
    sub
      .setName("remove")
      .setDescription("Remove an existing feed subscription")
      .addIntegerOption((opt) =>
        opt
          .setName("id")
          .setDescription("The Subscription ID (from /rss list)")
          .setRequired(true)
      )
  )
  // Subcommand: list
  .addSubcommand((sub) =>
    sub.setName("list").setDescription("List all RSS subscriptions in this server")
  )
  // Subcommand: test
  .addSubcommand((sub) =>
    sub
      .setName("test")
      .setDescription("Fetch an RSS/Atom feed and preview its latest article embed")
      .addStringOption((opt) =>
        opt
          .setName("url")
          .setDescription("The RSS or Atom feed URL to preview")
          .setRequired(true)
      )
  )
  // Subcommand: pause
  .addSubcommand((sub) =>
    sub
      .setName("pause")
      .setDescription("Pause automatic polling for a subscription")
      .addIntegerOption((opt) =>
        opt
          .setName("id")
          .setDescription("The Subscription ID")
          .setRequired(true)
      )
  )
  // Subcommand: resume
  .addSubcommand((sub) =>
    sub
      .setName("resume")
      .setDescription("Resume automatic polling for a paused subscription")
      .addIntegerOption((opt) =>
        opt
          .setName("id")
          .setDescription("The Subscription ID")
          .setRequired(true)
      )
  )
  // Subcommand: check
  .addSubcommand((sub) =>
    sub
      .setName("check")
      .setDescription("Trigger an immediate manual check for a subscription")
      .addIntegerOption((opt) =>
        opt
          .setName("id")
          .setDescription("The Subscription ID to check")
          .setRequired(true)
      )
  )
  // Subcommand: status
  .addSubcommand((sub) =>
    sub
      .setName("status")
      .setDescription("Show polling status, health, and timestamps for feeds")
      .addIntegerOption((opt) =>
        opt
          .setName("id")
          .setDescription("Specific Subscription ID (optional)")
          .setRequired(false)
      )
  );

export async function registerSlashCommands(
  token: string,
  clientId: string,
  guildId?: string
): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(token);
  const commands = [rssCommand.toJSON()];

  try {
    if (guildId) {
      console.log(`[Commands] Registering slash commands to Guild ${guildId}...`);
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
        body: commands,
      });
      console.log(`[Commands] Guild slash commands registered successfully.`);
    } else {
      console.log("[Commands] Registering global slash commands...");
      await rest.put(Routes.applicationCommands(clientId), {
        body: commands,
      });
      console.log("[Commands] Global slash commands registered successfully.");
    }
  } catch (error) {
    console.error("[Commands] Failed to register slash commands:", error);
    throw error;
  }
}
