# Guild Manager Bot — Discord Bot

A powerful Discord bot for managing Free Fire / Free Fire MAX guilds, viewing user profiles, and automating Discord role & rank synchronization.

## Features

- **User Profile System** — View detailed player profiles in Discord via `/profile`.
- **Guild Overview** — List all Hawk Eye guilds and member counts with `/guilds`.
- **Member List** — Browse members of a specific guild sorted by rank with `/memberlist`.
- **Ban List** — View the guild ban list with `/banlist`.
- **Role Linking** — Link Discord roles to in-game guilds and auto-sync with `/rolecheck`.
- **Rank Linking** — Link Discord roles to in-game ranks and auto-sync with `/rankcheck`.
- **Auto Role Sync** — Schedule automated periodic role & rank synchronization with `/autorolesync`.
- **Bot Commander Access** — Delegate bot admin access to trusted users with `/botcommander`.
- **Help Command** — View all available commands at a glance with `/help`.

## Setup Instructions

1. **Clone the repository**
   ```bash
   git clone <your-repository-url>
   cd "Guild bot 2.o"
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**

   Create a `.env` file in the root directory and fill in your values:

   ```env
   # Discord
   DISCORD_TOKEN=your_discord_bot_token_here
   CLIENT_ID=your_discord_application_client_id
   BOT_OWNER=your_discord_user_id
   OWNER_NAME=Your Name

   # API
   BEARER_TOKEN=your_api_bearer_token
   PROFILE_API_ENDPOINT=https://your-api-domain.com/api/user-management.php?action=get&uid
   GUILD_API_ENDPOINT=https://your-api-domain.com/api/guild-management.php?action=all_guilds_summary
   listguilds_endpoint=https://your-api-domain.com/api/user-management.php?action=list_members
   banlistapi_endpoint=https://your-api-domain.com/api/user-management.php?action=list_blacklist
   autosync_endpoint=https://your-api-domain.com/api/user-management.php?action=list_members&limit=55&offset=0&sort=updated_desc
   ```

4. **Deploy slash commands**

   Run this whenever you add or update commands:
   ```bash
   npm run deploy
   # or
   node deploy-commands.js
   ```

5. **Start the bot**
   ```bash
   npm start
   # or
   node index.js
   ```

## Available Commands

### 👤 User
| Command | Description |
|---|---|
| `/help` | Show all available commands |
| `/profile [@user]` | View a member's in-game profile |

### 🏰 Guild
| Command | Description |
|---|---|
| `/guilds` | List all Hawk Eye guilds with member counts |
| `/memberlist <guild>` | View members of a specific guild (sorted by rank) |
| `/banlist` | View the guild ban list |

### 🛡️ Admin
| Command | Description |
|---|---|
| `/autorolesync` | Manage automated role & rank sync (run / start / stop / status) |
| `/rolecheck` | Sync guild roles for a user or all members |
| `/rankcheck` | Sync rank roles for a user or all members |
| `/rolelink` | Link a Discord role to a guild |
| `/rolelinkremove` | Remove a linked role from a guild |
| `/rolelist` | View all role–guild links |
| `/ranklink` | Link a Discord role to an in-game rank |
| `/botcommander` | Manage bot commander access |

## Technologies Used

- [Node.js](https://nodejs.org/)
- [Discord.js v14](https://discord.js.org/)
- [Axios](https://www.npmjs.com/package/axios) for API requests

## License

This project is licensed under the MIT License.  
Developed by **Vikas Singh** — [Hawk Eye Official]