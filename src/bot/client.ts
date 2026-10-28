import {
  Client,
  Events,
  GatewayIntentBits,
  type Interaction,
} from "discord.js";
import { getConfig } from "../config";
import { handleRssCommand } from "./handlers/rss";
import { registerSlashCommands } from "./commands";
import { RssPoller } from "../rss/poller";

export function createDiscordClient(): Client {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
  });

  client.on(Events.Error, (error) => {
    console.error("[Discord] Client error:", error);
  });

  client.on(Events.Warn, (warning) => {
    console.warn("[Discord] Client warning:", warning);
  });

  client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === "rss") {
      try {
        await handleRssCommand(interaction);
      } catch (err) {
        console.error("[Discord] Uncaught error in /rss interaction:", err);
        const replyMsg = {
          content: "❌ An internal error occurred while processing the command.",
          ephemeral: true,
        };
        if (interaction.deferred || interaction.replied) {
          await interaction.followUp(replyMsg).catch(() => {});
        } else {
          await interaction.reply(replyMsg).catch(() => {});
        }
      }
    }
  });

  return client;
}

export async function startDiscordBot(
  client: Client,
  poller: RssPoller
): Promise<void> {
  const config = getConfig();

  client.once(Events.ClientReady, async (readyClient) => {
    console.log(`[Discord] Bot logged in as ${readyClient.user.tag}`);

    // Register slash commands (guild-specific in dev if configured, else global)
    try {
      await registerSlashCommands(
        config.DISCORD_TOKEN,
        config.DISCORD_CLIENT_ID,
        config.DISCORD_GUILD_ID
      );
    } catch (err) {
      console.error("[Discord] Failed to register slash commands at startup:", err);
    }

    // Start RSS polling loop
    poller.start(20000);
  });

  console.log("[Discord] Logging into Gateway...");
  await client.login(config.DISCORD_TOKEN);
}
