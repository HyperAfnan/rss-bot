# Discord Bot Setup & Permissions Guide

This guide walks through creating and configuring your bot in the **Discord Developer Portal**, generating the proper OAuth2 authorization URL, and configuring Discord channel permissions.

---

## 🛠️ Step 1: Create the Discord Application

1. Open the [Discord Developer Portal](https://discord.com/developers/applications).
2. Click **New Application** in the top right.
3. Enter an application name (e.g. `RSS Feed Bot`) and accept Discord's Developer Terms of Service.
4. On the **General Information** page:
   - Copy the **Application ID** and save it as `DISCORD_CLIENT_ID` in your `.env`.

---

## 🤖 Step 2: Configure the Bot User

1. In the left navigation menu, click **Bot**.
2. Click **Reset Token** (or **Add Bot** if not already created).
3. Copy the generated token string immediately. Save it as `DISCORD_TOKEN` in your `.env`.
   > [!CAUTION]
   > Keep your bot token secure. Never commit it to GitHub or share it publicly.

### Gateway Intents Configuration
Scroll down to **Privileged Gateway Intents**:
- **Presence Intent**: **OFF**
- **Server Members Intent**: **OFF**
- **Message Content Intent**: **OFF**

> [!NOTE]
> This bot does **not** read general chat messages or track user presences. It interacts exclusively via Discord's native Slash Commands (`/rss`) and requires only standard `Guilds` gateway access. Disabling privileged intents improves security and eliminates the need for Discord verification.

---

## 🔗 Step 3: Generate the Bot Invite URL

1. In the left menu, navigate to **OAuth2 > URL Generator**.
2. Under **Scopes**, select:
   - `bot`
   - `applications.commands`
3. Under **Bot Permissions**, select the following:
   - **View Channels** (`ViewChannel`): Required to discover channels.
   - **Send Messages** (`SendMessages`): Required to publish updates.
   - **Embed Links** (`EmbedLinks`): Required to render RSS article embeds.
   - **Read Message History** (`ReadMessageHistory`): Required to read thread state.
   - **Create Public Threads** (`CreatePublicThreads`): Required if using dedicated threads.
   - **Send Messages in Threads** (`SendMessagesInThreads`): Required to post inside threads.

### Direct Permission Integer
The resulting permission integer is `397284550720`.

The generated URL follows this format:
```text
https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=397284550720&scope=bot%20applications.commands
```

4. Paste the URL into your browser, select your server, and click **Authorize**.

---

## 🛡️ Step 4: Discord Channel Permission Checks

If your server has restricted channels or role overrides, ensure the bot's role has explicit `Allow` permissions in the channels where feeds will be posted:

```text
Server Settings > Channels > Select Channel > Permissions
```

Verify that the bot's role has:
- `View Channel`: ✅ Allow
- `Send Messages`: ✅ Allow
- `Embed Links`: ✅ Allow
- `Create Public Threads`: ✅ Allow (if thread mode is enabled)
- `Send Messages in Threads`: ✅ Allow (if thread mode is enabled)

> [!TIP]
> If the bot lacks thread permissions when you run `/rss add thread:True`, it will log a warning and automatically fall back to posting directly into the parent text channel without failing.
