import { describe, expect, it, afterEach } from "bun:test";
import { fetchFeed } from "../src/rss/fetcher";

describe("Feed Fetcher & Payload Size Limits", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("should successfully fetch a 6MB feed that would exceed the old 5MB limit", async () => {
    const payload = "<rss><channel><title>Large Feed</title>" + "a".repeat(6 * 1024 * 1024) + "</channel></rss>";
    globalThis.fetch = (async () =>
      new Response(payload, {
        status: 200,
        headers: {
          "content-type": "application/rss+xml",
          etag: '"test-etag-123"',
          "last-modified": "Wed, 21 Oct 2026 07:28:00 GMT",
        },
      })) as unknown as typeof fetch;

    const result = await fetchFeed("https://example.com/rss.xml");
    expect(result.notModified).toBe(false);
    expect(result.status).toBe(200);
    expect(result.etag).toBe('"test-etag-123"');
    expect(result.lastModified).toBe("Wed, 21 Oct 2026 07:28:00 GMT");
    expect(result.xml).toBeDefined();
    expect(result.xml?.length).toBeGreaterThan(6 * 1024 * 1024);
  });

  it("should reject payload upfront if Content-Length header exceeds limit", async () => {
    const sixteenMb = 16 * 1024 * 1024;
    globalThis.fetch = (async () =>
      new Response("small-preview", {
        status: 200,
        headers: {
          "content-length": String(sixteenMb),
        },
      })) as unknown as typeof fetch;

    await expect(fetchFeed("https://example.com/huge-feed.xml")).rejects.toThrow(
      "Feed payload exceeds 15MB limit"
    );
  });

  it("should abort and reject streamed payloads exceeding 15MB", async () => {
    // Generate a stream exceeding 15MB
    const stream = new ReadableStream({
      start(controller) {
        const chunk = new Uint8Array(1024 * 1024); // 1MB per chunk
        for (let i = 0; i < 16; i++) {
          controller.enqueue(chunk);
        }
        controller.close();
      },
    });

    globalThis.fetch = (async () =>
      new Response(stream, {
        status: 200,
        headers: { "content-type": "application/xml" },
      })) as unknown as typeof fetch;

    await expect(fetchFeed("https://example.com/streamed-feed.xml")).rejects.toThrow(
      "Feed payload exceeds 15MB limit"
    );
  });

  it("should handle 304 Not Modified without downloading body", async () => {
    globalThis.fetch = (async () =>
      new Response(null, {
        status: 304,
        headers: {
          etag: '"etag-304"',
        },
      })) as unknown as typeof fetch;

    const result = await fetchFeed("https://example.com/cached.xml", {
      etag: '"etag-304"',
    });

    expect(result.notModified).toBe(true);
    expect(result.status).toBe(304);
    expect(result.etag).toBe('"etag-304"');
  });

  it("should propagate non-OK HTTP status errors", async () => {
    globalThis.fetch = (async () =>
      new Response("Not Found", {
        status: 404,
        statusText: "Not Found",
      })) as unknown as typeof fetch;

    await expect(fetchFeed("https://example.com/non-existent.xml")).rejects.toThrow(
      "HTTP 404 Not Found"
    );
  });
});
