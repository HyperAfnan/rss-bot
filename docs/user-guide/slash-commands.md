# Slash Commands Manual

All bot interactions are organized under the unified `/rss` slash command group. Commands require the **Manage Server** (`ManageGuild`) permission in Discord.

All responses are returned as **ephemeral messages** (visible only to the administrator executing the command), except for new article notifications which are broadcast publicly to the configured destination channel or thread.

---

## 📋 Command Summary Matrix

| Command | Arguments | Required Permissions | Description |
| :--- | :--- | :--- | :--- |
| [`/rss add`](#1-rss-add) | `url` *(req)*, `channel` *(opt)*, `interval` *(opt)*, `thread` *(opt)* | `Manage Server` | Subscribes a channel to a feed, provisions a thread, and establishes a baseline. |
| [`/rss remove`](#2-rss-remove) | `id` *(req)* | `Manage Server` | Deletes a subscription and all associated cached items. |
| [`/rss list`](#3-rss-list) | *None* | `Manage Server` | Lists all active and paused subscriptions in this server. |
| [`/rss test`](#4-rss-test) | `url` *(req)* | `Manage Server` | Fetches a feed live and previews its latest article embed without subscribing. |
| [`/rss pause`](#5-rss-pause) | `id` *(req)* | `Manage Server` | Temporarily halts automatic background polling for a feed. |
| [`/rss resume`](#6-rss-resume) | `id` *(req)* | `Manage Server` | Resumes automatic polling for a previously paused feed. |
| [`/rss check`](#7-rss-check) | `id` *(req)* | `Manage Server` | Forces an immediate poll on the very next 20-second scheduler cycle. |
| [`/rss status`](#8-rss-status) | `id` *(opt)* | `Manage Server` | Displays in-depth diagnostics, consecutive failure counts, and ETag states. |

---

## 📖 Command Details & Usage Examples

### 1. `/rss add`
Subscribes to an external RSS or Atom feed.

```text
/rss add url:<feed_url> [channel:<#channel>] [interval:<minutes>] [thread:<true|false>]
```

#### Parameters:
- **`url`** *(String, Required)*: The full HTTP/HTTPS URL of the RSS or Atom feed.
- **`channel`** *(Channel, Optional)*: The target text or announcement channel. If omitted, defaults to the channel where the command was typed.
- **`interval`** *(Integer, Optional)*: Polling frequency in minutes (Allowed range: `1` to `1440`; Default: `10`). Note: System minimum is constrained by `POLL_INTERVAL_MIN_SECONDS` (default: 1 minute).
- **`thread`** *(Boolean, Optional)*: Whether to create a dedicated thread for updates (Default: `True`).

#### Example:
```text
/rss add url:https://blog.cloudflare.com/rss/ channel:#tech-news interval:15 thread:True
```

#### Expected Response:
```text
✅ RSS Subscription Added
Subscribed to Cloudflare Blog
----------------------------------------
Subscription ID:      #3
Destination:          🧵 #📢 Cloudflare Blog (in #tech-news)
Poll Interval:        15 minutes
Feed URL:             https://blog.cloudflare.com/rss/
Baseline Established: Recorded 25 existing articles. Historical items will not be posted.
```

---

### 2. `/rss remove`
Permanently deletes a feed subscription.

```text
/rss remove id:<subscription_id>
```

#### Parameters:
- **`id`** *(Integer, Required)*: The subscription numeric ID (obtained from `/rss list`).

#### Example:
```text
/rss remove id:3
```

#### Expected Response:
```text
✅ Successfully removed subscription #3.
```

---

### 3. `/rss list`
Displays an overview of all feed subscriptions configured for the current server.

```text
/rss list
```

#### Expected Response:
```text
RSS Subscriptions (2)
Configured RSS/Atom feeds for this server:

#1 · 🧵 #📢 GitHub Changelog (Channel: #dev-updates) [🟢 Active]
URL: https://github.blog/changelog/feed/
Interval: Every 10m | Last check: 3 minutes ago

#2 · #general [⏸️ Paused]
URL: https://hnrss.org/frontpage
Interval: Every 30m | Last check: 1 hour ago
```

---

### 4. `/rss test`
Fetches and validates a feed in real-time and renders a preview of the latest article embed.

```text
/rss test url:<feed_url>
```

#### Parameters:
- **`url`** *(String, Required)*: The feed URL to test.

#### Expected Response:
A message with `🔍 Previewing latest article from: <Feed Title>` followed by the exact embed that will be rendered when new articles are published.

---

### 5. `/rss pause`
Temporarily halts polling for a specific feed without deleting historical items or channel threads.

```text
/rss pause id:<subscription_id>
```

#### Parameters:
- **`id`** *(Integer, Required)*: The subscription ID to pause.

#### Expected Response:
```text
⏸️ Subscription #1 has been paused. Automatic polling stopped.
```

---

### 6. `/rss resume`
Re-enables automated polling for a paused subscription.

```text
/rss resume id:<subscription_id>
```

#### Parameters:
- **`id`** *(Integer, Required)*: The subscription ID to resume.

#### Expected Response:
```text
▶️ Subscription #1 resumed. Automatic polling will continue.
```

---

### 7. `/rss check`
Bypasses the remaining polling wait time and schedules an immediate fetch on the next scheduler tick (within 20 seconds).

```text
/rss check id:<subscription_id>
```

#### Parameters:
- **`id`** *(Integer, Required)*: The subscription ID to check.

#### Expected Response:
```text
⚡ Manual feed check scheduled for subscription #1. It will be checked on the next polling cycle.
```

---

### 8. `/rss status`
Displays technical telemetry, health states, consecutive failure counters, and caching efficiency for subscriptions.

```text
/rss status [id:<subscription_id>]
```

#### Parameters:
- **`id`** *(Integer, Optional)*: Specific subscription ID to inspect. If omitted, returns status for all server feeds.

#### Expected Response:
```text
Status for Subscription #1
----------------------------------------
State:          🟢 Operational
Channel:        <#123456789012345678>
Dedicated Thread: <#987654321098765432>
URL:            https://blog.cloudflare.com/rss/
Last Success:   4 minutes ago
Next Check:     in 6 minutes
ETag Caching:   Active
```
If a feed is failing:
```text
State:          ⚠️ Failing (3 failures)
Last Error:     HTTP 502 Bad Gateway
```
