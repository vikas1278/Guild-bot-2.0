require('dotenv').config({ path: '.env', debug: false, override: false, quiet: true });
const { Client, Collection, Events, GatewayIntentBits } = require('discord.js');
const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// Command handling
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

// Load commands from subdirectories
const loadCommands = (dir) => {
    const commandFiles = fs.readdirSync(dir).filter(file => file.endsWith('.js') || fs.statSync(path.join(dir, file)).isDirectory());

    for (const file of commandFiles) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
            loadCommands(filePath); // Recursively load commands from subdirectories
        } else {
            const command = require(filePath);
            if ('data' in command && 'execute' in command) {
                // Add category based on parent folder name
                const category = path.basename(path.dirname(filePath));
                command.category = category;
                client.commands.set(command.data.name, command);
            } else {
                console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
            }
        }
    }
};

// Load commands from all subdirectories
loadCommands(commandsPath);

// Event: When the client is ready
client.once(Events.ClientReady, c => {
    console.log(`Ready! Logged in as ${c.user.tag}`);

    // Register slash commands
    const commands = [];
    const commandFiles = [];

    // Recursively get all command files
    const getCommandFiles = (dir) => {
        const files = fs.readdirSync(dir);

        for (const file of files) {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);

            if (stat.isDirectory()) {
                getCommandFiles(filePath);
            } else if (file.endsWith('.js')) {
                commandFiles.push(filePath);
            }
        }
    };

    getCommandFiles(commandsPath);

    // Prepare commands for registration
    for (const file of commandFiles) {
        const command = require(file);
        if ('data' in command && 'execute' in command) {
            commands.push(command.data.toJSON());
        }
    }

    // Register commands
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    (async () => {
        try {
            console.log(`Started refreshing ${commands.length} application (/) commands.`);

            if (!process.env.CLIENT_ID) {
                throw new Error('CLIENT_ID is not set in .env file');
            }

            const data = await rest.put(
                Routes.applicationCommands(process.env.CLIENT_ID),
                { body: commands },
            );

            console.log(`✅ Successfully reloaded ${data.length} application (/) commands.`);

            // Initialize background tasks
            const autoRoleSyncCmd = client.commands.get('autorolesync');
            if (autoRoleSyncCmd && typeof autoRoleSyncCmd.init === 'function') {
                autoRoleSyncCmd.init(client);
            }
        } catch (error) {
            console.error('❌ Failed to refresh application (/) commands:', error);
        }
    })();
});

// Event: Interaction (slash commands)
client.on(Events.InteractionCreate, async interaction => {
    // Handle Chat Input Commands
    if (interaction.isChatInputCommand()) {
        const command = interaction.client.commands.get(interaction.commandName);

        if (!command) {
            console.error(`No command matching ${interaction.commandName} was found.`);
            return;
        }

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(error);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
            } else {
                await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
            }
        }
        return;
    }

    // Handle Select Menu Interactions
    if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'rolelink_guild_select') {
            const command = interaction.client.commands.get('rolelink');
            if (command && command.handleGuildSelect) {
                try {
                    await command.handleGuildSelect(interaction);
                } catch (error) {
                    console.error('Error handling guild select:', error);
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({ content: 'An error occurred while processing your selection.', ephemeral: true });
                    }
                }
            }
        } else if (interaction.customId === 'ranklink_guild_select') {
            const command = interaction.client.commands.get('ranklink');
            if (command && command.handleGuildSelect) {
                try {
                    await command.handleGuildSelect(interaction);
                } catch (error) {
                    console.error('Error handling ranklink guild select:', error);
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({ content: 'An error occurred while processing your selection.', ephemeral: true });
                    }
                }
            }
        } else if (interaction.customId === 'bind_guild_select') {
            const command = interaction.client.commands.get('bind');
            if (command && command.handleGuildSelect) {
                try {
                    await command.handleGuildSelect(interaction);
                } catch (error) {
                    console.error('Error handling bind guild select:', error);
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({ content: 'An error occurred while processing your selection.', ephemeral: true });
                    }
                }
            }
        } else if (interaction.customId === 'rolelinkremove_select') {
            const command = interaction.client.commands.get('rolelinkremove');
            if (command && command.handleGuildSelect) {
                try {
                    await command.handleGuildSelect(interaction);
                } catch (error) {
                    console.error('Error handling rolelinkremove select:', error);
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({ content: 'An error occurred while processing your selection.', ephemeral: true });
                    }
                }
            }
        } else if (interaction.customId === 'rolecheck_guild_select') {
            const command = interaction.client.commands.get('rolecheck');
            if (command && command.handleGuildSelect) {
                try {
                    await command.handleGuildSelect(interaction);
                } catch (error) {
                    console.error('Error handling rolecheck guild select:', error);
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({ content: 'An error occurred while processing your selection.', ephemeral: true });
                    }
                }
            }
        }
    }
});

// Login to Discord
if (!process.env.DISCORD_TOKEN) {
    console.error('❌ ERROR: DISCORD_TOKEN is not set in .env file');
    process.exit(1);
}

client.login(process.env.DISCORD_TOKEN)
    .then(() => console.log('✅ Bot is now connected to Discord!'))
    .catch(error => {
        console.error('❌ Failed to log in to Discord:', error);
        process.exit(1);
    });
