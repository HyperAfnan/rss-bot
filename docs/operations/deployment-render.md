# Deployment to Render (Free Web Service)

This guide provides instructions for deploying the RSS Discord Bot on **Render's Free Web Service** using the provided [`Dockerfile`](file:///home/afnan/Projects/rss-bot/Dockerfile) and [`render.yaml`](file:///home/afnan/Projects/rss-bot/render.yaml) blueprint.

---

## 🏗️ Multi-Stage Dockerfile Walkthrough

The project uses a hardened, multi-stage [`Dockerfile`](file:///home/afnan/Projects/rss-bot/Dockerfile) built on the official `oven/bun:1-slim` Debian-based image:

```dockerfile
# 1. Base Layer
FROM oven/bun:1-slim AS base
WORKDIR /app

# 2. Dependency Caching Layer
FROM base AS install
RUN mkdir -p /temp/prod
COPY package.json bun.lock /temp/prod/
RUN cd /temp/prod && bun install --frozen-lockfile --production

# 3. Production Release Layer
FROM base AS release
COPY --from=install /temp/prod/node_modules node_modules
COPY package.json tsconfig.json ./
COPY src ./src

ENV NODE_ENV=production
EXPOSE 3000

USER bun
CMD ["bun", "run", "src/index.ts"]
```

### Security & Optimization Features:
- **Layer Caching**: `package.json` and `bun.lock` are copied and built in a separate staging container so dependency layers are cached until lockfile updates occur.
- **Production Stripping**: Installs dependencies with `--production` to exclude dev-only types and test packages.
- **Least-Privilege Execution**: Switches from `root` to the unprivileged built-in `bun` user (`USER bun`) prior to startup.
- **Minimal Image Footprint**: Resulting Docker image size is under $130\text{MB}$.

---

## 🚀 Deployment Methods

### Method 1: Infrastructure as Code (`render.yaml`)

The repository includes a ready-to-use [`render.yaml`](file:///home/afnan/Projects/rss-bot/render.yaml) specification:

```yaml
services:
  - type: web
    name: rss-discord-bot
    runtime: docker
    plan: free
    healthCheckPath: /health
    autoDeploy: true
    envVars:
      - key: NODE_ENV
        value: production
      - key: DATABASE_URL
        sync: false
      - key: DISCORD_TOKEN
        sync: false
      - key: DISCORD_CLIENT_ID
        sync: false
      - key: DISCORD_GUILD_ID
        sync: false
      - key: POLL_INTERVAL_DEFAULT_SECONDS
        value: "600"
      - key: CONCURRENT_POLL_LIMIT
        value: "5"
```

1. Fork or push the repository to GitHub or GitLab.
2. In Render Dashboard, click **Blueprints > New Blueprint Instance**.
3. Connect your repository. Render automatically reads `render.yaml`.
4. Enter the secret environment variables (`DATABASE_URL`, `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`) when prompted.
5. Click **Apply**.

---

### Method 2: Manual Dashboard Setup

1. In Render Dashboard, click **New + > Web Service**.
2. Connect your Git repository.
3. Select **Docker** as the runtime.
4. Select the **Free** instance type.
5. In **Advanced Settings**, configure:
   - **Health Check Path**: `/health`
   - **Auto-Deploy**: `Yes`
6. Add the following **Environment Variables**:

| Key | Value / Instructions |
| :--- | :--- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Your pooled PostgreSQL connection string (e.g. from Supabase or Neon). |
| `DISCORD_TOKEN` | Discord bot secret token from the Developer Portal. |
| `DISCORD_CLIENT_ID` | Discord application Client ID. |
| `PORT` | Render automatically supplies `PORT=10000`. The bot binds to `0.0.0.0:${PORT}`. |
| `POLL_INTERVAL_DEFAULT_SECONDS` | `600` (optional, default: 10 minutes) |
| `CONCURRENT_POLL_LIMIT` | `5` (optional, default: 5 feeds) |

7. Click **Deploy Web Service**.

---

## 🩺 Verifying Deployment

Once deployment completes, Render runs an initial health check against `/health`:

1. View the **Logs** tab in Render:
   ```text
   =========================================
      🚀 RSS Discord Bot Starting Up        
   =========================================
   [Config] Loaded configuration in production mode.
   [Database] Initializing database schema...
   [Database] Database schema initialized successfully.
   [HTTP] Health server running at http://0.0.0.0:10000
   [Discord] Logging into Gateway...
   [Discord] Bot logged in as RSS Bot#1234
   [Commands] Registering global slash commands...
   [Commands] Global slash commands registered successfully.
   [Poller] RSS Poller started.
   ```
2. Test the public URL in your terminal:
   ```bash
   curl -i https://your-service.onrender.com/health
   ```
   Expected response:
   ```http
   HTTP/1.1 200 OK
   Content-Type: application/json
   Cache-Control: no-store, no-cache, must-revalidate

   {"status":"ok","timestamp":"2026-10-31T09:30:00.000Z","uptimeSeconds":120,"services":{"database":"connected","discord":"ready"}}
   ```
