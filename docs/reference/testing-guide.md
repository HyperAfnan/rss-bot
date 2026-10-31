# Testing Guide

The RSS Discord Bot includes a comprehensive test suite powered by **Bun's built-in test runner** (`bun:test`). Tests cover XML normalization, HTML sanitization, SSRF IP subnet filtering, configuration loading, embed generation, dedicated thread unarchiving, and HTTP health probes.

---

## 🏃 Running the Tests

Execute the full suite from the repository root:

```bash
bun test
```

### Type Checking & Linting
Ensure TypeScript strict types pass without errors:
```bash
bun run typecheck
```

---

## 🧪 Test Suite Manifest

The test suite consists of 23 test cases across 6 dedicated test modules:

```text
tests/
├── parser.test.ts       # XML/Atom parsing, HTML entity decoding, itemKey generation
├── ssrf.test.ts         # IPv4/IPv6 private ranges, dangerous schemes, DNS filtering
├── config.test.ts       # Zod schema validation, defaults, and numeric coercion
├── publisher.test.ts    # Embed layout, truncation rules, and thread unarchival mocks
├── health.test.ts       # Discord status mapping and HTTP server GET/HEAD assertions
└── fetcher.test.ts      # Payload limits, streaming chunk reader, and 304 caching
```

---

## 🔬 Test Specifications by Module

### 1. `tests/parser.test.ts`
Tests the parsing engine in [`src/rss/parser.ts`](file:///home/afnan/Projects/rss-bot/src/rss/parser.ts):
- **HTML Stripping & Decoding**: Asserts that `<p>`, `<br>`, `<style>`, `<script>`, and decimal (`&#8217;`), hex (`&#x27;`), and named (`&amp;`, `&quot;`) entities convert to clean plaintext.
- **RSS 2.0 Normalization**: Verifies that standard RSS channels, items, GUIDs, Yahoo `<media:content>` images, and dates parse accurately.
- **Atom 1.0 Normalization**: Verifies `<feed>`, `<entry>`, `<id>`, `<content>`, and `@_rel="alternate"` link parsing.
- **Fallback Fingerprinting**: Asserts that feeds omitting both `<guid>` and `<link>` generate deterministic SHA-256 fallback hashes based on `${title}::${publishedAt}`.

### 2. `tests/ssrf.test.ts`
Tests the network defense firewall in [`src/rss/fetcher.ts`](file:///home/afnan/Projects/rss-bot/src/rss/fetcher.ts):
- **Private IPv4 Subnets**: Asserts `isPrivateIP()` flags `127.0.0.1`, `10.0.0.1`, `172.16.0.1`, `192.168.1.1`, `169.254.169.254`, and `0.0.0.0` as `true`.
- **Public IPv4 Allowlist**: Asserts `isPrivateIP()` allows `8.8.8.8`, `1.1.1.1`, and public IPs (`false`).
- **IPv6 Boundaries**: Tests `::1`, `fc00::1` (ULA), `fe80::1` (link-local), and IPv4-mapped IPv6 (`::ffff:127.0.0.1`).
- **Protocol Rejection**: Confirms that non-HTTP/HTTPS URLs (`file:///etc/passwd`, `ftp://`, `gopher://`) reject with an explicit security error.
- **Internal Hostnames**: Asserts that `http://localhost/`, `http://sub.local/`, and `http://app.internal/` are blocked.

### 3. `tests/config.test.ts`
Tests configuration loading in [`src/config.ts`](file:///home/afnan/Projects/rss-bot/src/config.ts):
- **Fail-Fast Validation**: Verifies that missing `DATABASE_URL`, `DISCORD_TOKEN`, or `DISCORD_CLIENT_ID` throws a descriptive multiline error.
- **Default Assignment**: Validates default values (`PORT=3000`, `POLL_INTERVAL_DEFAULT_SECONDS=600`, `CONCURRENT_POLL_LIMIT=5`, `MAX_FEED_SIZE_MB=15`).
- **Coercion**: Verifies that string numbers from environment variables (`"8080"`) correctly coerce to native numbers.

### 4. `tests/publisher.test.ts`
Tests embed construction and Discord API interactions in [`src/services/publisher.ts`](file:///home/afnan/Projects/rss-bot/src/services/publisher.ts):
- **Embed Fields**: Verifies RSS orange color (`0xff7700`), titles, URLs, timestamps, author names, and image URLs.
- **Discord Length Boundaries**: Verifies titles over 256 characters truncate to 253 + `...`, and descriptions over 1000 characters truncate cleanly.
- **Thread Unarchiving**: Mocks a Discord `ThreadChannel` with `archived = true` and asserts that `resolveTargetDestination()` calls `setArchived(false)` before attempting message publication.

### 5. `tests/health.test.ts`
Tests the HTTP health server in [`src/http/health.ts`](file:///home/afnan/Projects/rss-bot/src/http/health.ts):
- **Status Text Mapping**: Verifies mapping from Discord.js `Status.Ready`, `Status.Connecting`, etc., to lowercase strings.
- **HTTP Methods**: Spawns an ephemeral `Bun.serve` instance on port 0 and tests:
  - `GET /health`: Returns JSON with `status`, `uptimeSeconds`, `services`.
  - `HEAD /health`: Returns HTTP 200 with headers and empty body.
  - `GET /ping`: Returns plain text `"pong"`.

### 6. `tests/fetcher.test.ts`
Tests HTTP fetching, payload ceilings, and stream cancellation in [`src/rss/fetcher.ts`](file:///home/afnan/Projects/rss-bot/src/rss/fetcher.ts):
- **Large Feed Ingestion**: Verifies that feeds up to 6MB succeed under the 15MB limit.
- **Content-Length Early Rejection**: Asserts that responses with `Content-Length > 15MB` reject upfront without downloading chunks.
- **Chunked Stream Cancellation**: Simulates an unbounded byte stream and confirms `reader.cancel()` aborts the stream when 15MB is exceeded.
- **304 Not Modified Caching**: Validates that HTTP 304 skips body download and returns `notModified: true`.
- **HTTP Error Propagation**: Asserts that HTTP 404 / 500 status codes throw descriptive errors.

---

## ✍️ Writing New Tests

When adding features, adhere to the following patterns:

### Example: Testing a Parser Feature
```typescript
import { describe, expect, it } from "bun:test";
import { parseFeedXml } from "../src/rss/parser";

describe("Custom Feed Feature", () => {
  it("should correctly handle custom author tags", () => {
    const xml = `<?xml version="1.0"?>
      <rss version="2.0">
        <channel>
          <title>Test</title>
          <item>
            <title>Post</title>
            <author>editor@example.com (Jane Doe)</author>
          </item>
        </channel>
      </rss>`;

    const parsed = parseFeedXml(xml);
    expect(parsed.items[0]?.author).toBe("editor@example.com (Jane Doe)");
  });
});
```
