# Troubleshooting Runbook

This runbook provides diagnostic procedures, root-cause analyses, and solutions for operational issues encountered when running the RSS Discord Bot.

---

## 🧭 Rapid Triage Matrix

| Symptom | Probable Cause | Action |
| :--- | :--- | :--- |
| Slash commands (`/rss`) not showing in Discord | Global command propagation delay. | Set `DISCORD_GUILD_ID` for instant dev sync; wait up to 1h for global. |
| `Missing required permissions` error in channel | Discord role hierarchy or channel override. | Grant `View Channel`, `Send Messages`, `Embed Links` to bot role. |
| `Domain resolves to private or restricted address` | SSRF firewall triggered. | Feed domain points to internal IP (`127.0.0.1`, `10.x.x.x`, `169.254.x.x`). |
| Bot stops posting updates after ~15 minutes | Render free tier entered idle sleep. | Configure UptimeRobot to ping `/health` every 5 minutes. |
| Database connection error (`ECONNREFUSED` / timeout) | Supabase direct IPv6 connection failed. | Switch `DATABASE_URL` to pooled host on port `6543`. |
| `Thread is archived` error | Discord archived inactive thread. | Bot auto-unarchives; ensure bot has `Send Messages in Threads`. |

---

## 🔒 SSRF & Network Errors

### Error: `Domain resolves to a private or restricted network address (<IP>)`
- **Cause**: The domain resolves to an IP address categorized under RFC 1918 (private), RFC 3927 (link-local/cloud metadata), or loopback.
- **Diagnostic**: Run DNS resolution from your terminal:
  ```bash
  dig +short example.com
  ```
- **Remediation**: Feeds hosted behind intranet reverse proxies or local dev servers cannot be polled directly by public cloud instances. Host the feed on a publicly routable domain.

### Error: `Forbidden protocol "<protocol>". Only HTTP and HTTPS are permitted.`
- **Cause**: The submitted feed URL used a non-web scheme (e.g. `file://`, `ftp://`, `gopher://`).
- **Remediation**: Ensure URLs begin with `http://` or `https://`.

---

## 🤖 Discord Permissions & Slash Command Errors

### Issue: Commands do not appear in Discord
- **Cause**: Global slash command updates through Discord's REST API can take up to **1 hour** to cache across all regional Discord clusters.
- **Solution (Development)**:
  1. Add your server ID to `.env`:
     ```env
     DISCORD_GUILD_ID=123456789012345678
     ```
  2. Restart the bot. Guild-specific commands sync **instantly**.

### Error: `Missing required permissions (ViewChannel, SendMessages, EmbedLinks) in channel #channel`
- **Cause**: The bot's server role lacks permissions in the designated channel due to channel-level permission overrides.
- **Remediation**:
  1. Navigate to `#channel > Edit Channel > Permissions`.
  2. Add the bot's role or user.
  3. Explicitly toggle **View Channel**, **Send Messages**, and **Embed Links** to **Allow (Green Checkmark)**.

### Error: `Unknown interaction (10062)`
- **Cause**: A slash command failed to acknowledge Discord's gateway within 3 seconds.
- **Remediation**: All `/rss` handlers use `interaction.deferReply({ ephemeral: true })` before performing async I/O. If this error appears, check for severe CPU throttling or database connection stalls.

---

## 🧵 Thread Lifecycle Diagnostics

### Symptom: Bot cannot post in thread or thread is missing
- **Behavior 1: Archived Thread**:
  Discord automatically archives threads without activity. The bot's publisher automatically runs `setArchived(false)` before sending messages. Ensure the bot has the `Send Messages in Threads` permission.
- **Behavior 2: Deleted Thread**:
  If a human administrator deletes the thread, the bot catches the 404 error, logs a warning, automatically creates a new thread in the parent channel, and updates the database record via `updateSubscriptionThread()`.

---

## 🗄️ Database & Connection Pool Errors

### Error: `Max client connections reached` / `remaining connection slots are reserved`
- **Cause**: Direct connection to Supabase without a pooler exhausted available PostgreSQL backend slots.
- **Remediation**:
  1. Switch to the Supabase **Transaction Pooler**:
     - Host: `aws-0-[region].pooler.supabase.com`
     - Port: `6543`
  2. Verify that `max: 10` is not exceeded in [`src/db/client.ts`](file:///home/afnan/Projects/rss-bot/src/db/client.ts#L21).

### Error: `self-signed certificate in certificate chain`
- **Cause**: Node/Bun rejected the SSL certificate of a cloud provider.
- **Remediation**: [`src/db/client.ts`](file:///home/afnan/Projects/rss-bot/src/db/client.ts#L18) sets `rejectUnauthorized: false` whenever a remote database domain (`supabase.co`, `render.com`, `pooler.supabase.com`) is detected. Ensure your `DATABASE_URL` contains one of these domain fragments or `NODE_ENV=production`.

---

## 📦 Feed Payload & Parser Errors

### Error: `Feed payload exceeds <N>MB limit`
- **Cause**: The target feed returned a payload larger than the configured limit (default: 15 megabytes), either via `Content-Length` header or chunked byte stream (potential XML bomb or multi-year unpaginated feed).
- **Remediation**: If this is a legitimate large feed, increase `MAX_FEED_SIZE_MB` in your environment variables (e.g. `MAX_FEED_SIZE_MB=25`). Alternatively, contact the feed provider to ask for a paginated feed endpoint.

### Error: `Unrecognized feed format. Expected valid RSS 2.0 or Atom XML`
- **Cause**: The target URL returned JSON, HTML (such as a 404/500 error page or a Cloudflare challenge), or an unsupported XML schema.
- **Remediation**: Run `/rss test url:<url>` to inspect the raw preview. Verify the feed in an external validator like [W3C Feed Validation Service](https://validator.w3.org/feed/).
