import { loadConfig } from "./config";
import { initDatabase, closeDatabase } from "./db/client";
import { createDiscordClient, startDiscordBot } from "./bot/client";
import { RssPoller } from "./rss/poller";
import { startHealthServer } from "./http/health";

async function bootstrap() {
  console.log("=========================================");
  console.log("   🚀 RSS Discord Bot Starting Up        ");
  console.log("=========================================");

  // 1. Validate environment configuration
  let config;
  try {
    config = loadConfig();
    console.log(`[Config] Loaded configuration in ${config.NODE_ENV} mode.`);
  } catch (err) {
    console.error("[Config] Startup aborted due to invalid configuration:");
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  // 2. Initialize database schema
  try {
    await initDatabase();
  } catch (err) {
    console.error("[Database] Failed to connect or initialize schema:", err);
    process.exit(1);
  }

  // 3. Initialize Discord client & Poller
  const discordClient = createDiscordClient();
  const poller = new RssPoller(discordClient);

  // 4. Start HTTP Health server for Render and UptimeRobot
  const healthServer = startHealthServer(discordClient);

  // 5. Connect to Discord Gateway
  try {
    await startDiscordBot(discordClient, poller);
  } catch (err) {
    console.error("[Discord] Failed to connect to Discord Gateway:", err);
  }

  // 6. Graceful shutdown handler
  let isShuttingDown = false;
  const gracefulShutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`\n[Shutdown] Received ${signal}. Initiating graceful shutdown...`);

    try {
      poller.stop();
      healthServer.stop();
      discordClient.destroy();
      await closeDatabase();
      console.log("[Shutdown] All services stopped cleanly. Bye!");
      process.exit(0);
    } catch (err) {
      console.error("[Shutdown] Error during shutdown:", err);
      process.exit(1);
    }
  };

  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
}

bootstrap().catch((err) => {
  console.error("[Fatal] Unexpected failure during startup:", err);
  process.exit(1);
});
