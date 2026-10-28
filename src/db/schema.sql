-- Guilds
CREATE TABLE IF NOT EXISTS guilds (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
  id SERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL,
  feed_url TEXT NOT NULL,
  poll_interval_seconds INTEGER NOT NULL DEFAULT 600,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_checked_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_channel_feed UNIQUE (channel_id, feed_url)
);

-- Feed Items (Duplicate prevention)
CREATE TABLE IF NOT EXISTS feed_items (
  id SERIAL PRIMARY KEY,
  subscription_id INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL,
  item_url TEXT,
  title TEXT,
  published_at TIMESTAMPTZ,
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  posted_at TIMESTAMPTZ,
  CONSTRAINT uq_subscription_item UNIQUE (subscription_id, item_key)
);

-- Feed State (Supports conditional HTTP requests & scheduling)
CREATE TABLE IF NOT EXISTS feed_state (
  subscription_id INTEGER PRIMARY KEY REFERENCES subscriptions(id) ON DELETE CASCADE,
  etag TEXT,
  last_modified TEXT,
  last_success_at TIMESTAMPTZ,
  next_check_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  consecutive_failures INTEGER NOT NULL DEFAULT 0
);

-- Indexes for efficient polling and lookups
CREATE INDEX IF NOT EXISTS idx_subscriptions_guild ON subscriptions(guild_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_enabled ON subscriptions(enabled);
CREATE INDEX IF NOT EXISTS idx_feed_state_next_check ON feed_state(next_check_at);
CREATE INDEX IF NOT EXISTS idx_feed_items_subscription_posted ON feed_items(subscription_id, posted_at);
