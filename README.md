# Guild Manager Discord Bot

A powerful Discord bot for managing Free Fire / Free Fire MAX guilds, viewing user profiles, and linking Discord roles to in-game guilds.

## Features

- **User Profile System**: View detailed player profiles directly in Discord using `/profile`.
- **Guild Management**: View list of all guilds with `/guilds` and check their members with `/memberlist`.
- **Role Linking**: Automatically link Discord roles to specific in-game guilds (e.g., Hawk Eye 01, 02) to manage access easily.
- **Easy to Use**: Simple slash commands for all features. Built with `discord.js` v14.

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

3. **Configure the bot**
   - Create a `.env` file in the root directory (you can use the provided variables as a guide).
   - Fill in your Discord bot token and API endpoints.
   
   Here is a list of environment variables you need in your `.env`:
   ```env
   DISCORD_TOKEN=your_discord_bot_token_here
   CLIENT_ID=your_discord_application_client_id
   BOT_OWNER=your_discord_user_id
   
   # API Endpoints
   PROFILE_API_ENDPOINT=https://your-api-domain.com/api/user-management.php?action=get&uid
   BEARER_TOKEN=your_api_bearer_token
   GUILD_API_ENDPOINT=https://your-api-domain.com/api/guild-management.php?action=all_guilds_summary
   listguilds_endpoint=https://your-api-domain.com/api/user-management.php?action=list_members
   ```

4. **Deploy Slash Commands**
   Before starting the bot for the first time or whenever you add new commands, you need to register the slash commands with Discord:
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

### User Commands
- `/help` - View all available commands and how to use them.
- `/profile [uid]` - View a player's profile by their UID.

### Guild Commands
- `/guilds` - Show a summary of all loaded guilds and their member counts.
- `/memberlist <guild>` - Display the member list for a specifically selected guild.

### Admin Commands
- `/botcommander <role/user>` - Set a user or role as the bot commander.
- `/rolecheck` - Verify and check guild roles to ensure users in Discord match the in-game guild members.
- `/rolelist` - List all currently linked roles.
- `/rolelink <role> <guild>` - Link a Discord role to a specific in-game guild.
- `/rolelinkremove <role>` - Remove a previously linked Discord role.

## Technologies Used
- [Node.js](https://nodejs.org/)
- [Discord.js (v14)](https://discord.js.org/)
- [Axios / Node-fetch](https://www.npmjs.com/package/axios) for API requests.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
Developed by **vikas singh** (Organization: **Hawk Eye Official**).
