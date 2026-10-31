# Feed Management Best Practices

This guide outlines operational strategies for managing RSS and Atom feeds across your Discord server, choosing between dedicated threads and text channels, setting appropriate polling intervals, and understanding baseline mechanics.

---

## 🧵 Dedicated Threads vs. Text Channels

When subscribing to a feed via `/rss add`, you can specify whether to create a dedicated thread (`thread:True`) or post directly into the target channel (`thread:False`).

### Comparison Matrix

| Consideration | Dedicated Thread (`thread:True`) | Direct Channel (`thread:False`) |
| :--- | :--- | :--- |
| **Ideal For** | High-frequency feeds (Reddit, Hacker News, active blogs). | Low-frequency announcement feeds (GitHub releases, status blogs). |
| **Notification Impact**| Users only get notified if they join or follow the thread. | Every post pings users configured for channel notifications. |
| **Channel Clutter** | Channel remains clean; articles reside inside the thread. | Articles fill the main channel history. |
| **Discussion** | Users can discuss individual articles inside the thread. | Discussion mixes directly with automated bot messages. |
| **Archival Behavior** | Auto-archives after 1 week of inactivity; **bot auto-unarchives**. | Never archived. |

---

## ⏱️ Selecting Polling Intervals

The polling interval dictates how often the bot checks the feed origin for new articles.

- **Default Interval**: 10 minutes (`interval:10`).
- **Minimum Interval**: 1 minute (`interval:1`).

### Recommended Cadence by Feed Type

| Feed Source | Recommended Interval | Rationale |
| :--- | :---: | :--- |
| **System Status / Incident Feeds** | `2` – `5` minutes | Incident updates require rapid dissemination. |
| **Release Announcements** (GitHub, npm) | `15` – `30` minutes | Infrequent updates; lower load on origin. |
| **Tech Blogs & News Portals** | `10` – `15` minutes | Standard balance between freshness and bandwidth. |
| **High-Volume Social Submissions** (Reddit/HN)| `5` – `10` minutes | Batches new articles in reasonable intervals. |

> [!TIP]
> Setting intervals too low (e.g. 1 minute on small personal blogs) can cause origin servers or Cloudflare WAFs to block the bot's IP address. Standard 10-15 minute intervals are courteous to publishers while maintaining timely updates.

---

## 🎯 The Zero-Spam Baseline Explained

When you subscribe to a popular feed (such as the Cloudflare Blog), the XML document often contains 20 to 50 existing articles.

### What Happens Behind the Scenes:
1. **Initial Parse**: When you run `/rss add`, the bot fetches and parses all 25 articles currently listed in the feed.
2. **Indexing**: It inserts all 25 articles into the database `feed_items` table with `posted_at = NOW()`.
3. **Channel State**: Zero messages are posted to Discord during setup.
4. **Subsequent Polls**: When the publisher releases article #26, the bot detects that #26 does not exist in the database and broadcasts only that new article to Discord.

---

## 🩺 Diagnosing Failing Feeds

Use `/rss status` to inspect the health of your server's feeds.

### Operational Indicators:
- `🟢 Operational`: The feed is returning HTTP 200 or 304 successfully.
- `⏸️ Paused`: The feed was manually paused with `/rss pause`. Automatic polling is suspended.
- `⚠️ Failing (N failures)`: The origin feed has returned errors for $N$ consecutive attempts.

### Common Failure Scenarios & Solutions:

1. **HTTP 403 Forbidden / Cloudflare Challenge**:
   - *Cause*: The origin feed has Cloudflare "Under Attack" mode enabled or blocks automated scraping.
   - *Action*: Some feeds offer alternative RSS mirrors or FeedBurner links.
2. **HTTP 404 Not Found**:
   - *Cause*: The feed URL was moved, renamed, or deleted by the publisher.
   - *Action*: Remove the old subscription via `/rss remove` and re-add the updated URL.
3. **Invalid XML Format**:
   - *Cause*: The web server returned an HTML error page or login screen instead of valid XML.
   - *Action*: Run `/rss test url:<url>` to inspect whether the URL returns valid RSS or Atom XML.
