import { describe, expect, it } from "bun:test";
import { getDiscordStatusText, startHealthServer } from "../src/http/health";
import { Status, type Client } from "discord.js";

describe("Health HTTP Server", () => {
  it("should map Discord Status enum correctly to text", () => {
    expect(getDiscordStatusText(Status.Ready)).toBe("ready");
    expect(getDiscordStatusText(Status.Connecting)).toBe("connecting");
    expect(getDiscordStatusText(Status.Disconnected)).toBe("disconnected");
    expect(getDiscordStatusText(Status.Idle)).toBe("idle");
  });

  it("should support HEAD and GET on /health and /ping", async () => {
    const mockClient = {
      ws: { status: Status.Ready },
    } as unknown as Client;

    // Use ephemeral port 0 for testing
    process.env.PORT = "0";
    const server = startHealthServer(mockClient);
    const baseUrl = `http://${server.hostname}:${server.port}`;

    try {
      // 1. GET /health
      const getRes = await fetch(`${baseUrl}/health`, { method: "GET" });
      expect([200, 503]).toContain(getRes.status);
      expect(getRes.headers.get("content-type")).toContain("application/json");
      expect(getRes.headers.get("cache-control")).toContain("no-store");
      const body = (await getRes.json()) as Record<string, unknown>;
      expect(body.services).toBeDefined();

      // 2. HEAD /health
      const headRes = await fetch(`${baseUrl}/health`, { method: "HEAD" });
      expect(headRes.status).toBe(getRes.status);
      expect(headRes.headers.get("content-type")).toContain("application/json");
      expect(headRes.headers.get("cache-control")).toContain("no-store");
      const headText = await headRes.text();
      expect(headText).toBe(""); // HEAD must return empty body

      // 3. HEAD /ping
      const headPing = await fetch(`${baseUrl}/ping`, { method: "HEAD" });
      expect(headPing.status).toBe(200);
      expect(await headPing.text()).toBe("");

      // 4. Disallowed method returns 405
      const postRes = await fetch(`${baseUrl}/health`, { method: "POST" });
      expect(postRes.status).toBe(405);
      expect(postRes.headers.get("allow")).toBe("GET, HEAD");
    } finally {
      server.stop(true);
    }
  });
});
