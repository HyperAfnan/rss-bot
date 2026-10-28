import { describe, expect, it } from "bun:test";
import { isPrivateIP, validateFeedUrlSafe } from "../src/rss/fetcher";

describe("SSRF and IP Validation", () => {
  it("should identify private and loopback IPv4 addresses", () => {
    expect(isPrivateIP("127.0.0.1")).toBe(true);
    expect(isPrivateIP("10.0.0.1")).toBe(true);
    expect(isPrivateIP("172.16.0.1")).toBe(true);
    expect(isPrivateIP("172.31.255.255")).toBe(true);
    expect(isPrivateIP("192.168.1.1")).toBe(true);
    expect(isPrivateIP("169.254.169.254")).toBe(true);
    expect(isPrivateIP("0.0.0.0")).toBe(true);
  });

  it("should allow public IPv4 addresses", () => {
    expect(isPrivateIP("8.8.8.8")).toBe(false);
    expect(isPrivateIP("1.1.1.1")).toBe(false);
    expect(isPrivateIP("93.184.216.34")).toBe(false);
  });

  it("should identify private and loopback IPv6 addresses", () => {
    expect(isPrivateIP("::1")).toBe(true);
    expect(isPrivateIP("fc00::1")).toBe(true);
    expect(isPrivateIP("fe80::1")).toBe(true);
    expect(isPrivateIP("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateIP("::ffff:192.168.0.1")).toBe(true);
  });

  it("should reject dangerous protocols", async () => {
    await expect(validateFeedUrlSafe("file:///etc/passwd")).rejects.toThrow(
      "Only HTTP and HTTPS are permitted"
    );
    await expect(validateFeedUrlSafe("ftp://example.com/feed.xml")).rejects.toThrow(
      "Only HTTP and HTTPS are permitted"
    );
    await expect(validateFeedUrlSafe("gopher://example.com")).rejects.toThrow(
      "Only HTTP and HTTPS are permitted"
    );
  });

  it("should reject localhost and internal hostnames", async () => {
    await expect(validateFeedUrlSafe("http://localhost/feed.xml")).rejects.toThrow(
      "Localhost and internal hostnames are prohibited"
    );
    await expect(validateFeedUrlSafe("http://sub.local/feed.xml")).rejects.toThrow(
      "Localhost and internal hostnames are prohibited"
    );
    await expect(validateFeedUrlSafe("http://app.internal/rss")).rejects.toThrow(
      "Localhost and internal hostnames are prohibited"
    );
  });

  it("should reject private IP hostnames directly in URL", async () => {
    await expect(validateFeedUrlSafe("http://127.0.0.1:8080/rss")).rejects.toThrow(
      "Private, loopback, and link-local IP addresses are prohibited"
    );
    await expect(validateFeedUrlSafe("http://169.254.169.254/latest/meta-data")).rejects.toThrow(
      "Private, loopback, and link-local IP addresses are prohibited"
    );
  });
});
