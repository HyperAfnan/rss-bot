# RSS Discord Bot

A reliable, lightweight, self-hosted RSS and Atom Discord bot built with **Bun**, **TypeScript**, **discord.js**, and **PostgreSQL** (e.g. Supabase). Designed specifically for deployment on **Render's Free Web Service** with **UptimeRobot** health monitoring.

---

## Features

- ⚡ **Stateless & Resilient**: Application state and cursors live exclusively in PostgreSQL. The bot recovers due subscriptions seamlessly across restarts, crashes, and redeployments.
- 🚫 **Duplicate Prevention**: Guaranteed duplicate prevention with a composite database constraint on `(subscription_id, item_key)` and canonical URL fallback.
- 🎯 **Baseline Establishment**: On new subscriptions, historical articles are indexed without being spammed to your channel. Only new articles published after subscription are sent.
- 🔒 **Security First (SSRF Protection)**: Strict validation blocks loopback, private RFC 1918 subnets, and cloud metadata endpoints (`169.254.169.254`).
- ⚡ **Conditional HTTP Requests**: Uses HTTP `ETag` and `Last-Modified` (`304 Not Modified`) headers to minimize bandwidth, CPU, and target feed server load.
- 🛡️ **Dual-layer Permissions**: Slash commands require `Manage Server` permissions in both Discord command metadata and runtime execution logic.
- 🩺 **Health & Readiness Endpoints**: Native HTTP server binding to `0.0.0.0:${PORT}` with `/health` and `/ready` endpoints for Render and UptimeRobot.

---

## 📚 Complete Production-Grade Documentation

Comprehensive technical documentation is available in the [`docs/`](./docs) directory:

- 🏛️ **Architecture & Design**: [System Overview](./docs/architecture/overview.md) · [Database Design & Constraints](./docs/architecture/database-design.md) · [Lifecycle & Resilience](./docs/architecture/lifecycle-and-resilience.md)
- 🔬 **Module Technical References**: [Configuration](./docs/modules/configuration.md) · [Database Layer](./docs/modules/database-layer.md) · [Network & SSRF](./docs/modules/network-and-ssrf.md) · [Feed Parser Engine](./docs/modules/feed-parser.md) · [Polling Engine](./docs/modules/polling-engine.md) · [Publishing Service](./docs/modules/publishing-service.md) · [Subscription Service](./docs/modules/subscription-service.md) · [Discord Bot](./docs/modules/discord-bot.md) · [Health Server](./docs/modules/health-server.md)
- 📖 **User & Admin Guides**: [Slash Commands Manual](./docs/user-guide/slash-commands.md) · [Discord Setup & Permissions](./docs/user-guide/discord-setup.md) · [Feed Management Best Practices](./docs/user-guide/feed-management.md)
- 🛠️ **Operations & Runbooks**: [Render Deployment](./docs/operations/deployment-render.md) · [UptimeRobot Monitoring](./docs/operations/monitoring-uptimerobot.md) · [Database Maintenance](./docs/operations/database-maintenance.md) · [Security & Threat Model](./docs/operations/security-and-threat-model.md) · [Troubleshooting Runbook](./docs/operations/troubleshooting.md)
- 📚 **Reference**: [Standards & Glossary](./docs/reference/glossary.md) · [Testing Guide](./docs/reference/testing-guide.md)

Explore the full documentation portal at **[`docs/README.md`](./docs/README.md)**.

---

## Architecture

```text
               +----------------------------------------------------+
               |                 External RSS Feeds                 |
               +-------------------------+--------------------------+
                                         | HTTP (ETag / If-Modified)
                                         v
+----------------+            +---------------------+            +-----------------------+
|  UptimeRobot   |            |  Bun Service        |            |  PostgreSQL Database  |
|  Pings /health | ---------> |  - Poller Loop      | <--------> |  - guilds             |
|  every 5 mins  |            |  - Slash Handlers   |            |  - subscriptions      |
+----------------+            |  - Health Server    |            |  - feed_items         |
                              +----------+----------+            |  - feed_state         |
                                         |                       +-----------------------+
                                         | discord.js Gateway
                                         v
                              +---------------------+
                              |   Discord Server    |
                              |   Channel Embeds    |
                              +---------------------+
```

---

## Slash Commands

All commands are grouped under `/rss` and require **Manage Server** (`ManageGuild`) permissions:

| Command | Arguments | Description |
| :--- | :--- | :--- |
| `/rss add` | `url` *(req)*, `channel` *(opt)*, `interval` *(opt)*, `thread` *(opt)* | Subscribe to an RSS/Atom feed. Creates a dedicated thread (default: True) and establishes baseline. |
| `/rss remove` | `id` *(req)* | Remove a subscription and delete its stored items. |
| `/rss list` | *None* | List all configured feeds, target channels, and statuses for this server. |
| `/rss test` | `url` *(req)* | Fetch a feed on-demand and preview its latest article embed without subscribing. |
| `/rss pause` | `id` *(req)* | Temporarily pause automatic polling for a subscription. |
| `/rss resume` | `id` *(req)* | Resume automatic polling for a paused subscription. |
| `/rss check` | `id` *(req)* | Schedule an immediate manual check on the next polling cycle. |
| `/rss status` | `id` *(opt)* | View detailed health status, consecutive failures, ETag state, and last errors. |

---

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) (v1.1+)
- A [Discord Application & Bot](https://discord.com/developers/applications)
- A PostgreSQL database (e.g. [Supabase](https://supabase.com), [Neon](https://neon.tech), or local PostgreSQL)

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/your-username/rss-bot.git
cd rss-bot
bun install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Fill in your credentials:

```env
NODE_ENV=development
DATABASE_URL=postgresql://postgres:[PASSWORD]@[HOST]:[PORT]/postgres
DISCORD_TOKEN=your_bot_token_here
DISCORD_CLIENT_ID=your_application_client_id_here
PORT=3000
MAX_FEED_SIZE_MB=15
```

> **Tip (Development):** Add `DISCORD_GUILD_ID=your_server_id` to `.env` to register slash commands instantly to your test server without waiting for Discord's global command sync.

### 3. Database Initialization

The bot automatically creates all necessary tables (`guilds`, `subscriptions`, `feed_items`, `feed_state`) and indexes on boot via `src/db/schema.sql`.

Alternatively, you can run the SQL script manually in the Supabase SQL editor located at `src/db/schema.sql`.

### 4. Run the Bot

```bash
# Development mode with hot-reloading
bun run dev

# Run test suite
bun test

# Type-check TypeScript
bun run typecheck

# Production start
bun run start
```

---

## Discord Bot Configuration

1. Visit the [Discord Developer Portal](https://discord.com/developers/applications).
2. Create a **New Application** and navigate to the **Bot** tab.
3. Reset/Copy the **Token** and paste it into `DISCORD_TOKEN`.
4. Copy the **Application ID** from the **General Information** tab and paste it into `DISCORD_CLIENT_ID`.
5. Under the **Bot** tab, disable all **Privileged Gateway Intents** (this bot only requires standard `Guilds` intent).
6. Generate an invite link under **OAuth2 > URL Generator**:
   - Scopes: `bot`, `applications.commands`
   - Bot Permissions:
     - `View Channels`
     - `Send Messages`
     - `Embed Links`
     - `Read Message History`
7. Invite the bot to your server.

---

## Deployment to Render (Free Web Service)

1. Fork or push this repository to GitHub.
2. Log into [Render](https://render.com) and click **New > Web Service**.
3. Connect your repository.
4. Select **Docker** or **Bun** environment (Render natively detects `Dockerfile` or `render.yaml`).
5. Choose the **Free** instance type.
6. Configure Environment Variables in Render:
   - `NODE_ENV`: `production`
   - `DATABASE_URL`: `your_postgres_connection_string` (For Supabase, use the pooled connection string on port 6543)
   - `DISCORD_TOKEN`: `your_bot_token`
   - `DISCORD_CLIENT_ID`: `your_discord_client_id`
7. Set Health Check Path to:
   - `/health`
8. Click **Deploy**.

---

## Uptime Monitoring with UptimeRobot

Render's free tier spins down web services after 15 minutes of inactivity. To keep your RSS poller running:

1. Sign up for a free account at [UptimeRobot](https://uptimerobot.com).
2. Click **Add New Monitor**.
3. Select **HTTP(s)** monitor type.
4. Name: `RSS Discord Bot Health`.
5. URL: `https://your-service-name.onrender.com/health`.
6. Monitoring Interval: **5 minutes**.
7. Create the monitor.

Every 5 minutes, UptimeRobot sends a GET request to `/health`. The bot verifies database connectivity and returns HTTP 200:

```json
{
  "status": "ok",
  "timestamp": "2026-10-29T00:30:00.000Z",
  "uptimeSeconds": 86400,
  "services": {
    "database": "connected",
    "discord": "ready"
  }
}
```

---

## Security

- **Server-Side Request Forgery (SSRF) Prevention**: Resolves domain names via DNS and rejects private ranges (e.g. `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, IPv6 ULA/link-local).
- **Payload Size & Memory Guards**: Protects against denial-of-service and memory exhaustion with configurable payload limits (default: 15MB via `MAX_FEED_SIZE_MB`), upfront `Content-Length` inspection, and streaming byte guards.
- **Discord Permission Enforcement**: Permissions are validated at the Discord API level with `setDefaultMemberPermissions` and checked at runtime in command execution.
- **Graceful Shutdown**: Intercepts `SIGINT` and `SIGTERM` signals to cleanly stop the polling queue, drain in-flight web requests, and close database connections without data loss.

---

## License

MIT
