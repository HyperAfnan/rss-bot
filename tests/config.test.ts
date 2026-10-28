import { describe, expect, it } from "bun:test";
import { loadConfig } from "../src/config";

describe("Configuration Loading & Validation", () => {
  it("should fail validation when required environment variables are missing", () => {
    expect(() => loadConfig({})).toThrow("Environment configuration error");
  });

  it("should parse valid configuration and assign defaults", () => {
    const validEnv = {
      DATABASE_URL: "postgresql://postgres:pass@localhost:5432/rss_bot",
      DISCORD_TOKEN: "mock_discord_token",
      DISCORD_CLIENT_ID: "123456789012345678",
    };

    const config = loadConfig(validEnv);
    expect(config.NODE_ENV).toBe("development");
    expect(config.PORT).toBe(3000);
    expect(config.HOST).toBe("0.0.0.0");
    expect(config.POLL_INTERVAL_DEFAULT_SECONDS).toBe(600);
    expect(config.CONCURRENT_POLL_LIMIT).toBe(5);
    expect(config.DATABASE_URL).toBe(validEnv.DATABASE_URL);
    expect(config.DISCORD_TOKEN).toBe(validEnv.DISCORD_TOKEN);
    expect(config.DISCORD_CLIENT_ID).toBe(validEnv.DISCORD_CLIENT_ID);
  });

  it("should enforce integer coercion for PORT and poll intervals", () => {
    const customEnv = {
      DATABASE_URL: "postgresql://postgres:pass@localhost:5432/rss_bot",
      DISCORD_TOKEN: "mock_discord_token",
      DISCORD_CLIENT_ID: "123456789012345678",
      PORT: "8080",
      POLL_INTERVAL_DEFAULT_SECONDS: "300",
    };

    const config = loadConfig(customEnv);
    expect(config.PORT).toBe(8080);
    expect(config.POLL_INTERVAL_DEFAULT_SECONDS).toBe(300);
  });
});
