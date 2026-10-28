import { describe, expect, it } from "bun:test";
import { parseFeedXml, stripHtmlAndDecode } from "../src/rss/parser";

describe("RSS and Atom Parser", () => {
  it("should strip HTML and decode common entities", () => {
    const raw = "<p>Hello &amp; <b>World</b>! It&#39;s &quot;fine&quot; &lt;here&gt; &nbsp;</p>";
    const cleaned = stripHtmlAndDecode(raw);
    expect(cleaned).toBe("Hello & World! It's \"fine\" <here>");
  });

  it("should parse an RSS 2.0 feed accurately", () => {
    const rssXml = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0">
<channel>
  <title><![CDATA[Tech News & Updates]]></title>
  <link>https://example.com</link>
  <description>Latest tech news</description>
  <item>
    <title><![CDATA[New Bun Release &amp; Features]]></title>
    <link>https://example.com/posts/bun-release</link>
    <guid isPermaLink="true">https://example.com/posts/bun-release</guid>
    <pubDate>Mon, 27 Oct 2026 10:00:00 GMT</pubDate>
    <dc:creator>John Doe</dc:creator>
    <description><![CDATA[<p>Bun 1.4 includes exciting new features!</p>]]></description>
    <enclosure url="https://example.com/image.png" type="image/png" length="1024"/>
  </item>
</channel>
</rss>`;

    const feed = parseFeedXml(rssXml);
    expect(feed.title).toBe("Tech News & Updates");
    expect(feed.link).toBe("https://example.com");
    expect(feed.items.length).toBe(1);

    const item = feed.items[0]!;
    expect(item.title).toBe("New Bun Release & Features");
    expect(item.link).toBe("https://example.com/posts/bun-release");
    expect(item.itemKey).toBe("https://example.com/posts/bun-release");
    expect(item.author).toBe("John Doe");
    expect(item.description).toBe("Bun 1.4 includes exciting new features!");
    expect(item.imageUrl).toBe("https://example.com/image.png");
    expect(item.publishedAt).toBeInstanceOf(Date);
  });

  it("should parse an Atom 1.0 feed accurately", () => {
    const atomXml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Engineering Blog</title>
  <link href="https://blog.example.com"/>
  <updated>2026-10-27T12:00:00Z</updated>
  <entry>
    <title>PostgreSQL Optimization Guide</title>
    <link rel="alternate" href="https://blog.example.com/postgres-opt"/>
    <id>urn:uuid:1225c695-cfb8-4ebb-aaaa-80da344efa6a</id>
    <published>2026-10-27T11:00:00Z</published>
    <author>
      <name>Alice Smith</name>
    </author>
    <summary>Deep dive into Postgres query indexing.</summary>
  </entry>
</feed>`;

    const feed = parseFeedXml(atomXml);
    expect(feed.title).toBe("Engineering Blog");
    expect(feed.link).toBe("https://blog.example.com");
    expect(feed.items.length).toBe(1);

    const item = feed.items[0]!;
    expect(item.title).toBe("PostgreSQL Optimization Guide");
    expect(item.link).toBe("https://blog.example.com/postgres-opt");
    expect(item.itemKey).toBe("urn:uuid:1225c695-cfb8-4ebb-aaaa-80da344efa6a");
    expect(item.author).toBe("Alice Smith");
    expect(item.description).toBe("Deep dive into Postgres query indexing.");
    expect(item.publishedAt?.toISOString()).toBe("2026-10-27T11:00:00.000Z");
  });

  it("should generate a fallback hash itemKey when GUID and link are missing", () => {
    const xml = `<rss version="2.0">
<channel>
  <title>No Link Feed</title>
  <item>
    <title>Item Without Link Or Guid</title>
    <pubDate>Mon, 27 Oct 2026 12:00:00 GMT</pubDate>
  </item>
</channel>
</rss>`;

    const feed = parseFeedXml(xml);
    expect(feed.items.length).toBe(1);
    expect(feed.items[0]?.itemKey).toBeDefined();
    expect(feed.items[0]?.itemKey.length).toBe(64); // SHA-256 hex length
  });
});
