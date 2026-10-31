# Standards & Glossary

A quick-reference dictionary of protocols, standards, RFCs, and Discord terminology referenced across the codebase and documentation.

---

## 🌐 Web & Feed Standards

### RSS 2.0 (Really Simple Syndication)
An XML-based syndication format formalized by the RSS Advisory Board. Root element is `<rss version="2.0">`, containing a single `<channel>` with metadata (title, link, description) and repeated `<item>` elements. Identifiers are conveyed via `<guid>`.

### Atom 1.0 (RFC 4287)
An IETF standard format developed as an alternative to RSS. Root element is `<feed xmlns="http://www.w3.org/2005/Atom">`, containing metadata (title, subtitle, link) and repeated `<entry>` elements. Identifiers are conveyed via `<id>`.

### RSS 1.0 / RDF (Resource Description Framework)
An XML format utilizing RDF namespaces (`rdf:RDF`). Feed items often exist directly under the root or inside `<channel>`. Item identifiers frequently use `<dc:identifier>` or `<link>`.

### HTTP Conditional Requests (RFC 7232)
A standardized mechanism where HTTP clients validate cached responses against origin servers:
- **`ETag` / `If-None-Match`**: An entity tag (fingerprint) sent by the server. If unchanged, the server responds with `304 Not Modified` without transmitting the body.
- **`Last-Modified` / `If-Modified-Since`**: An HTTP date string indicating when the document was last revised.

### HTTP 304 Not Modified
An HTTP status code signaling that the requested resource has not been altered since the version specified in `If-None-Match` or `If-Modified-Since`. Saves bandwidth and CPU processing.

---

## 🔒 Security & Network RFCs

### RFC 1918 (Private Address Allocation)
Defines IPv4 address ranges reserved for private enterprise and home networks:
- `10.0.0.0/8` (`10.0.0.0` – `10.255.255.255`)
- `172.16.0.0/12` (`172.16.0.0` – `172.31.255.255`, including Docker default bridge `172.17.0.0/16`)
- `192.168.0.0/16` (`192.168.0.0` – `192.168.255.255`)

### RFC 3927 (IPv4 Link-Local / Cloud Metadata)
Defines the `169.254.0.0/16` block used for link-local autoconfiguration. Cloud platforms (AWS, GCP, Azure, DigitalOcean, Render) host instance metadata endpoints at `http://169.254.169.254`. Accessing this address is blocked by the bot's SSRF filter.

### RFC 6598 (Shared Address Space / CGNAT)
Defines `100.64.0.0/10` (`100.64.0.0` – `100.127.255.255`) used for Carrier-Grade NAT between ISPs and subscribers.

### RFC 4291 / RFC 4193 (IPv6 Addressing)
Defines IPv6 address types:
- `::1`: Loopback address.
- `fc00::/7`: Unique Local Addresses (ULA) reserved for local communications.
- `fe80::/10`: Link-Local Unicast addresses.
- `ff00::/8`: Multicast addresses.

### SSRF (Server-Side Request Forgery)
A web security vulnerability that allows an attacker to induce the server-side application to make HTTP requests to an arbitrary domain or internal network.

---

## 💬 Discord Platform Concepts

### Discord Gateway
A persistent WebSocket connection over TLS through which Discord sends real-time events (`Events.ClientReady`, `Events.InteractionCreate`) to connected bots.

### Discord REST API (v10)
Discord's HTTP API used for non-realtime operations, such as publishing messages, creating threads, and registering slash commands (`Routes.applicationCommands`).

### Ephemeral Message
A Discord message that is visible exclusively to the user who invoked the slash command. Automatically dismissed when the user navigates away or clicks dismiss.

### `ThreadAutoArchiveDuration`
A Discord property determining how long a thread remains open without user messages before Discord automatically hides/archives it (`OneDay`, `ThreeDays`, `OneWeek`).

### Zero-Spam Baseline
The architectural technique of pre-recording all existing articles in a feed with `posted_at = NOW()` upon initial subscription, ensuring historical articles are never broadcast into the server.
