import { XMLParser } from "fast-xml-parser";
import { createHash } from "node:crypto";

export interface ParsedFeedItem {
  itemKey: string;
  title: string;
  link: string | null;
  description: string | null;
  publishedAt: Date | null;
  author: string | null;
  imageUrl: string | null;
}

export interface ParsedFeed {
  title: string;
  description: string | null;
  link: string | null;
  items: ParsedFeedItem[];
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
  parseTagValue: false, // Keep raw strings to avoid unwanted number/date conversions
});

export function stripHtmlAndDecode(input: string): string {
  if (!input) return "";
  return input
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = parseInt(dec, 10);
      return !isNaN(code) ? String.fromCharCode(code) : "";
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const code = parseInt(hex, 16);
      return !isNaN(code) ? String.fromCharCode(code) : "";
    })
    .replace(/\s+/g, " ")
    .trim();
}

function extractText(node: unknown): string | null {
  if (node === null || node === undefined) return null;
  if (typeof node === "string") return node.trim();
  if (typeof node === "number" || typeof node === "boolean") return String(node);
  if (typeof node === "object") {
    if ("#text" in (node as Record<string, unknown>)) {
      return extractText((node as Record<string, unknown>)["#text"]);
    }
  }
  return null;
}

function extractLink(node: unknown): string | null {
  if (!node) return null;
  if (typeof node === "string") return node.trim();
  if (typeof node === "object") {
    const record = node as Record<string, unknown>;
    // Check href attribute (Atom <link href="..."/>)
    if ("@_href" in record && typeof record["@_href"] === "string") {
      return record["@_href"].trim();
    }
    // Check #text
    if ("#text" in record) {
      return extractText(record["#text"]);
    }
  }
  if (Array.isArray(node)) {
    // If array of links (Atom often has rel="alternate" and rel="self")
    for (const item of node) {
      if (typeof item === "object" && item !== null) {
        const record = item as Record<string, unknown>;
        const rel = record["@_rel"];
        if (rel === "alternate" || !rel) {
          if ("@_href" in record && typeof record["@_href"] === "string") {
            return record["@_href"].trim();
          }
        }
      }
    }
    // Fallback to first link
    return extractLink(node[0]);
  }
  return null;
}

function parseDate(dateStr: unknown): Date | null {
  const text = extractText(dateStr);
  if (!text) return null;
  const d = new Date(text);
  return isNaN(d.getTime()) ? null : d;
}

function extractImage(node: unknown): string | null {
  if (!node || typeof node !== "object") return null;
  const record = node as Record<string, unknown>;

  // Check enclosure: <enclosure url="..." type="image/..."/>
  if ("enclosure" in record && record.enclosure && typeof record.enclosure === "object") {
    const enc = record.enclosure as Record<string, unknown>;
    const url = enc["@_url"];
    const type = enc["@_type"];
    if (typeof url === "string" && (!type || String(type).startsWith("image/"))) {
      return url.trim();
    }
  }

  // Check media:content: <media:content url="..." medium="image"/>
  if ("media:content" in record && record["media:content"] && typeof record["media:content"] === "object") {
    const media = record["media:content"] as Record<string, unknown>;
    const url = media["@_url"];
    if (typeof url === "string") return url.trim();
  }

  // Check media:thumbnail: <media:thumbnail url="..."/>
  if ("media:thumbnail" in record && record["media:thumbnail"] && typeof record["media:thumbnail"] === "object") {
    const thumb = record["media:thumbnail"] as Record<string, unknown>;
    const url = thumb["@_url"];
    if (typeof url === "string") return url.trim();
  }

  return null;
}

function generateItemKey(
  guid: string | null,
  link: string | null,
  title: string,
  publishedAt: Date | null
): string {
  // 1. Stable GUID/ID if present
  if (guid && guid.length > 0) {
    return guid.length > 255 ? createHash("sha256").update(guid).digest("hex") : guid;
  }

  // 2. Canonical URL
  if (link && link.length > 0) {
    return link.length > 255 ? createHash("sha256").update(link).digest("hex") : link;
  }

  // 3. Fallback hash of title + pubDate
  const dateStr = publishedAt ? publishedAt.toISOString() : "";
  return createHash("sha256").update(`${title}::${dateStr}`).digest("hex");
}

export function parseFeedXml(xmlContent: string): ParsedFeed {
  let parsed: Record<string, unknown>;
  try {
    parsed = xmlParser.parse(xmlContent);
  } catch (err) {
    throw new Error(`Invalid XML feed: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Unable to parse XML feed structure");
  }

  // Case 1: RSS 2.0 / RSS 0.9x / RSS 1.0 (RDF)
  if ("rss" in parsed || "rdf:RDF" in parsed) {
    const root = (parsed.rss ?? parsed["rdf:RDF"]) as Record<string, unknown>;
    const channel = (root?.channel ?? {}) as Record<string, unknown>;

    const feedTitle = stripHtmlAndDecode(extractText(channel.title) || "Untitled RSS Feed");
    const feedDescription = extractText(channel.description)
      ? stripHtmlAndDecode(extractText(channel.description)!)
      : null;
    const feedLink = extractLink(channel.link);

    // Items might be directly under channel (RSS 2.0) or root (RSS 1.0)
    const rawItems = (channel.item ?? root.item ?? []) as unknown;
    const itemArray: unknown[] = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];

    const items: ParsedFeedItem[] = itemArray.map((raw) => {
      const item = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
      const title = stripHtmlAndDecode(extractText(item.title) || "Untitled Article");
      const link = extractLink(item.link);
      const rawDesc = extractText(item["content:encoded"] ?? item.description ?? "");
      const description = rawDesc ? stripHtmlAndDecode(rawDesc) : null;
      const publishedAt = parseDate(item.pubDate ?? item["dc:date"] ?? item.date);
      const author = extractText(item["dc:creator"] ?? item.author);
      const guid = extractText(item.guid);
      const imageUrl = extractImage(item);

      const itemKey = generateItemKey(guid, link, title, publishedAt);

      return {
        itemKey,
        title,
        link,
        description,
        publishedAt,
        author,
        imageUrl,
      };
    });

    return {
      title: feedTitle,
      description: feedDescription,
      link: feedLink,
      items,
    };
  }

  // Case 2: Atom Feed
  if ("feed" in parsed) {
    const feed = parsed.feed as Record<string, unknown>;
    const feedTitle = stripHtmlAndDecode(extractText(feed.title) || "Untitled Atom Feed");
    const feedDescription = extractText(feed.subtitle)
      ? stripHtmlAndDecode(extractText(feed.subtitle)!)
      : null;
    const feedLink = extractLink(feed.link);

    const rawEntries = (feed.entry ?? []) as unknown;
    const entryArray: unknown[] = Array.isArray(rawEntries)
      ? rawEntries
      : rawEntries
      ? [rawEntries]
      : [];

    const items: ParsedFeedItem[] = entryArray.map((raw) => {
      const entry = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
      const title = stripHtmlAndDecode(extractText(entry.title) || "Untitled Article");
      const link = extractLink(entry.link);
      const rawDesc = extractText(entry.content ?? entry.summary ?? "");
      const description = rawDesc ? stripHtmlAndDecode(rawDesc) : null;
      const publishedAt = parseDate(entry.published ?? entry.updated);
      
      let author: string | null = null;
      if (entry.author && typeof entry.author === "object") {
        author = extractText((entry.author as Record<string, unknown>).name);
      } else if (entry.author) {
        author = extractText(entry.author);
      }

      const guid = extractText(entry.id);
      const imageUrl = extractImage(entry);

      const itemKey = generateItemKey(guid, link, title, publishedAt);

      return {
        itemKey,
        title,
        link,
        description,
        publishedAt,
        author,
        imageUrl,
      };
    });

    return {
      title: feedTitle,
      description: feedDescription,
      link: feedLink,
      items,
    };
  }

  throw new Error("Unrecognized feed format. Expected valid RSS 2.0 or Atom XML.");
}
