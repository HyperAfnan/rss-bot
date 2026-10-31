import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { getConfig } from "../config";

export interface FetchFeedResult {
  notModified: boolean;
  status: number;
  xml?: string;
  etag: string | null;
  lastModified: string | null;
}

/**
 * Checks if an IPv4 address is in a private, loopback, or reserved range.
 */
export function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return true; // Treat malformed as unsafe
  }

  const [b0, b1] = parts as [number, number, number, number];

  // 0.0.0.0/8 - Current network
  if (b0 === 0) return true;
  // 10.0.0.0/8 - Private RFC 1918
  if (b0 === 10) return true;
  // 100.64.0.0/10 - Carrier-grade NAT
  if (b0 === 100 && b1 >= 64 && b1 <= 127) return true;
  // 127.0.0.0/8 - Loopback
  if (b0 === 127) return true;
  // 169.254.0.0/16 - Link-local (Cloud metadata)
  if (b0 === 169 && b1 === 254) return true;
  // 172.16.0.0/12 - Private RFC 1918
  if (b0 === 172 && b1 >= 16 && b1 <= 31) return true;
  // 192.0.0.0/24 - IETF protocol assignments
  if (b0 === 192 && b1 === 0 && parts[2] === 0) return true;
  // 192.0.2.0/24 - TEST-NET-1
  if (b0 === 192 && b1 === 0 && parts[2] === 2) return true;
  // 192.168.0.0/16 - Private RFC 1918
  if (b0 === 192 && b1 === 168) return true;
  // 198.18.0.0/15 - Benchmarking
  if (b0 === 198 && (b1 === 18 || b1 === 19)) return true;
  // 198.51.100.0/24 - TEST-NET-2
  if (b0 === 198 && b1 === 51 && parts[2] === 100) return true;
  // 203.0.113.0/24 - TEST-NET-3
  if (b0 === 203 && b1 === 0 && parts[2] === 113) return true;
  // 224.0.0.0/4 - Multicast
  if (b0 >= 224 && b0 <= 239) return true;
  // 240.0.0.0/4 - Reserved
  if (b0 >= 240) return true;

  return false;
}

/**
 * Checks if an IPv6 address is in a private, loopback, or reserved range.
 */
export function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();

  // ::1 loopback
  if (normalized === "::1" || normalized === "0:0:0:0:0:0:0:1") return true;
  // :: unspecified
  if (normalized === "::" || normalized === "0:0:0:0:0:0:0:0") return true;

  // IPv4-mapped IPv6 (e.g. ::ffff:192.168.1.1)
  if (normalized.startsWith("::ffff:") || normalized.startsWith("0:0:0:0:0:ffff:")) {
    const lastPart = normalized.split(":").pop();
    if (lastPart && isIP(lastPart) === 4) {
      return isPrivateIPv4(lastPart);
    }
  }

  // fc00::/7 - Unique local addresses
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  // fe80::/10 - Link-local
  if (
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  ) {
    return true;
  }
  // ff00::/8 - Multicast
  if (normalized.startsWith("ff")) return true;

  return false;
}

export function isPrivateIP(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isPrivateIPv4(ip);
  if (version === 6) return isPrivateIPv6(ip);
  return true; // Unknown/invalid IP is treated as unsafe
}

/**
 * Validates a feed URL against SSRF attacks by inspecting protocol and DNS resolution.
 */
export async function validateFeedUrlSafe(urlString: string): Promise<URL> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(urlString);
  } catch {
    throw new Error("Invalid URL format");
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error(`Forbidden protocol "${parsedUrl.protocol}". Only HTTP and HTTPS are permitted.`);
  }

  const hostname = parsedUrl.hostname.toLowerCase();

  // Block localhost and standard loopback hostnames
  if (hostname === "localhost" || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    throw new Error("Localhost and internal hostnames are prohibited for security.");
  }

  // If hostname is directly an IP, validate it
  if (isIP(hostname)) {
    if (isPrivateIP(hostname)) {
      throw new Error("Private, loopback, and link-local IP addresses are prohibited.");
    }
    return parsedUrl;
  }

  // Resolve hostname via DNS
  try {
    const addresses = await lookup(hostname, { all: true });
    if (!addresses || addresses.length === 0) {
      throw new Error(`Hostname ${hostname} could not be resolved.`);
    }

    for (const record of addresses) {
      if (isPrivateIP(record.address)) {
        throw new Error(
          `Domain ${hostname} resolves to a private or restricted network address (${record.address}).`
        );
      }
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes("private or restricted")) {
      throw err;
    }
    throw new Error(`DNS resolution failed for ${hostname}: ${err instanceof Error ? err.message : String(err)}`);
  }

  return parsedUrl;
}

/**
 * Fetches feed content supporting conditional requests (ETag / Last-Modified)
 * and enforcing timeout and SSRF boundaries.
 */
export async function fetchFeed(
  urlString: string,
  state?: { etag?: string | null; lastModified?: string | null }
): Promise<FetchFeedResult> {
  const validatedUrl = await validateFeedUrlSafe(urlString);
  const config = getConfig();

  const headers: Record<string, string> = {
    "User-Agent": config.USER_AGENT,
    Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
  };

  if (state?.etag) {
    headers["If-None-Match"] = state.etag;
  }
  if (state?.lastModified) {
    headers["If-Modified-Since"] = state.lastModified;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(validatedUrl.toString(), {
      method: "GET",
      headers,
      signal: controller.signal,
      redirect: "follow",
    });

    const responseEtag = response.headers.get("etag");
    const responseLastModified = response.headers.get("last-modified");

    if (response.status === 304) {
      return {
        notModified: true,
        status: 304,
        etag: responseEtag ?? state?.etag ?? null,
        lastModified: responseLastModified ?? state?.lastModified ?? null,
      };
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const maxSizeBytes = config.MAX_FEED_SIZE_MB * 1024 * 1024;

    // Early guard: Check Content-Length header if present
    const contentLength = response.headers.get("content-length");
    if (contentLength) {
      const parsedLength = parseInt(contentLength, 10);
      if (!isNaN(parsedLength) && parsedLength > maxSizeBytes) {
        throw new Error(`Feed payload exceeds ${config.MAX_FEED_SIZE_MB}MB limit`);
      }
    }

    let xml = "";
    if (response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let totalBytes = 0;
      const chunks: string[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > maxSizeBytes) {
          try {
            await reader.cancel();
          } catch {
            // Ignore cancel error
          }
          throw new Error(`Feed payload exceeds ${config.MAX_FEED_SIZE_MB}MB limit`);
        }
        chunks.push(decoder.decode(value, { stream: true }));
      }
      chunks.push(decoder.decode());
      xml = chunks.join("");
    } else {
      xml = await response.text();
    }

    // Final guard against excessive decoded character length
    if (xml.length > maxSizeBytes) {
      throw new Error(`Feed payload exceeds ${config.MAX_FEED_SIZE_MB}MB limit`);
    }

    return {
      notModified: false,
      status: 200,
      xml,
      etag: responseEtag,
      lastModified: responseLastModified,
    };
  } finally {
    clearTimeout(timeout);
  }
}
