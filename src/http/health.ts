import { type Server } from "bun";
import { type Client, Status } from "discord.js";
import { getConfig } from "../config";
import { checkDatabaseConnection } from "../db/client";

export function getDiscordStatusText(status: Status): string {
  switch (status) {
    case Status.Ready:
      return "ready";
    case Status.Connecting:
      return "connecting";
    case Status.Reconnecting:
      return "reconnecting";
    case Status.Idle:
      return "idle";
    case Status.Nearly:
      return "nearly";
    case Status.Disconnected:
      return "disconnected";
    case Status.WaitingForGuilds:
      return "waiting_for_guilds";
    case Status.Identifying:
      return "identifying";
    case Status.Resuming:
      return "resuming";
    default:
      return "unknown";
  }
}

export function startHealthServer(discordClient: Client): ReturnType<typeof Bun.serve> {
  const config = getConfig();

  const server = Bun.serve({
    port: config.PORT,
    hostname: config.HOST,
    async fetch(req) {
      const url = new URL(req.url);

      if (url.pathname === "/health" || url.pathname === "/ready" || url.pathname === "/") {
        if (req.method !== "GET" && req.method !== "HEAD") {
          return new Response("Method Not Allowed", {
            status: 405,
            headers: { Allow: "GET, HEAD" },
          });
        }

        const dbOk = await checkDatabaseConnection();
        const wsStatus = discordClient.ws?.status;
        const discordStatus = getDiscordStatusText(wsStatus);

        const isHealthy = dbOk; // DB connectivity is primary health requirement
        const httpStatus = isHealthy ? 200 : 503;

        const headers = {
          "Content-Type": "application/json",
          "Cache-Control": "no-store, no-cache, must-revalidate",
        };

        if (req.method === "HEAD") {
          return new Response(null, {
            status: httpStatus,
            headers,
          });
        }

        return Response.json(
          {
            status: isHealthy ? "ok" : "degraded",
            timestamp: new Date().toISOString(),
            uptimeSeconds: Math.floor(process.uptime()),
            services: {
              database: dbOk ? "connected" : "disconnected",
              discord: discordStatus,
            },
          },
          {
            status: httpStatus,
            headers,
          }
        );
      }

      if (url.pathname === "/ping") {
        if (req.method !== "GET" && req.method !== "HEAD") {
          return new Response("Method Not Allowed", {
            status: 405,
            headers: { Allow: "GET, HEAD" },
          });
        }

        if (req.method === "HEAD") {
          return new Response(null, { status: 200 });
        }

        return new Response("pong", { status: 200 });
      }

      return new Response("Not Found", { status: 404 });
    },
  });

  console.log(`[HTTP] Health server running at http://${config.HOST}:${config.PORT}`);
  return server;
}
