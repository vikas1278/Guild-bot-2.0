# Guild Manager Discord Bot

A powerful Discord bot for managing guilds and viewing user profiles with Roblox integration.

## Features

- **User Profile System**: View detailed Roblox user profiles directly in Discord
- **Guild Management**: Manage your guild with various admin commands
- **Easy to Use**: Simple slash commands for all features
- **Modern UI**: Beautiful embeds with rich information display

## Setup Instructions

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/guild-bot.git
   cd guild-bot
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure the bot**
   - Copy `.env.example` to `.env`
   - Fill in your Discord bot token and other required information

4. **Invite the bot to your server**
   - Create a bot application at [Discord Developer Portal](https://discord.com/developers/applications)
   - Copy the bot token and add it to your `.env` file
   - Use this invite link (replace CLIENT_ID with your bot's client ID):
     ```
     https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=8&scope=bot%20applications.commands
     ```

5. **Start the bot**
   ```bash
   node index.js
   ```

## Available Commands

### User Commands
- `/profile [username]` - View a Roblox user's profile

### Admin Commands
*(Coming soon!)*

## Configuration

The following environment variables are available in the `.env` file:

| Variable | Description | Required |
|----------|-------------|----------|
| `TOKEN` | Your Discord bot token | ✅ Yes |
| `CLIENT_ID` | Your Discord application client ID | ✅ Yes |
| `ROBLOX_API_KEY` | Roblox API key (if needed) | ❌ No |

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
