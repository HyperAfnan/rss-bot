import { describe, expect, it } from "bun:test";
import { formatFeedEmbed } from "../src/services/publisher";

describe("Publisher & Embed Formatting", () => {
  it("should correctly format a feed item into a Discord Embed", () => {
    const item = {
      itemKey: "test-guid-1",
      title: "Antigravity Engineering Blog",
      link: "https://example.com/post-1",
      description: "An article about agentic engineering and reliable bots.",
      publishedAt: new Date("2026-10-27T10:00:00Z"),
      author: "Jane Smith",
      imageUrl: "https://example.com/image.jpg",
    };

    const embed = formatFeedEmbed(item, "Tech Radar");
    const json = embed.toJSON();

    expect(json.title).toBe("Antigravity Engineering Blog");
    expect(json.url).toBe("https://example.com/post-1");
    expect(json.description).toBe("An article about agentic engineering and reliable bots.");
    expect(json.author?.name).toBe("Jane Smith");
    expect(json.image?.url).toBe("https://example.com/image.jpg");
    expect(json.footer?.text).toBe("Feed: Tech Radar");
    expect(json.color).toBe(0xff7700);
  });

  it("should truncate overly long titles and descriptions to fit Discord limits", () => {
    const item = {
      itemKey: "long-item-1",
      title: "A".repeat(300),
      link: "https://example.com/long",
      description: "B".repeat(1500),
      publishedAt: null,
      author: null,
      imageUrl: null,
    };

    const embed = formatFeedEmbed(item);
    const json = embed.toJSON();

    expect(json.title?.length).toBeLessThanOrEqual(256);
    expect(json.title?.endsWith("...")).toBe(true);
    expect(json.description?.length).toBeLessThanOrEqual(1000);
    expect(json.description?.endsWith("...")).toBe(true);
  });

  it("should unarchive an archived dedicated thread when resolving target destination", async () => {
    let unarchived = false;

    const mockThread = {
      id: "thread-123",
      name: "Cloudflare Updates",
      isThread: () => true,
      archived: true,
      setArchived: async (val: boolean) => {
        if (!val) unarchived = true;
      },
    };

    const mockParentChannel = {
      id: "parent-chan-1",
      name: "updates",
      isTextBased: () => true,
      guild: {
        members: {
          fetchMe: async () => ({
            id: "bot-1",
          }),
        },
      },
      permissionsFor: () => ({
        has: () => true,
      }),
    };

    const mockClient = {
      channels: {
        fetch: async (id: string) => {
          if (id === "thread-123") return mockThread;
          if (id === "parent-chan-1") return mockParentChannel;
          return null;
        },
      },
    } as any;

    const mockSubscription = {
      id: 1,
      guild_id: "guild-1",
      channel_id: "parent-chan-1",
      feed_url: "https://blog.cloudflare.com/rss",
      thread_id: "thread-123",
      poll_interval_seconds: 600,
      enabled: true,
      last_checked_at: null,
      last_error: null,
      created_at: new Date(),
    };

    const { resolveTargetDestination } = await import("../src/services/publisher");
    const target = await resolveTargetDestination(mockClient, mockSubscription, "Cloudflare Blog");

    expect(target.id).toBe("thread-123");
    expect(unarchived).toBe(true);
  });
});
