const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config();

const commands = [];
const commandsPath = path.join(__dirname, 'commands');

// Load commands from all subdirectories
function loadCommands(dir) {
    const files = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const file of files) {
        const filePath = path.join(dir, file.name);
        
        if (file.isDirectory()) {
            // Recursively load commands from subdirectories
            loadCommands(filePath);
        } else if (file.name.endsWith('.js')) {
            // Load the command file
            const command = require(filePath);
            if ('data' in command && 'execute' in command) {
                commands.push(command.data.toJSON());
                console.log(`✅ Loaded command: ${command.data.name}`);
            } else {
                console.log(`❌ Skipping command at ${filePath} - missing required "data" or "execute" property.`);
            }
        }
    }
}

// Load all commands
loadCommands(commandsPath);

// Construct and prepare an instance of the REST module
if (!process.env.DISCORD_TOKEN) {
    console.error('❌ ERROR: DISCORD_TOKEN is not set in .env file');
    process.exit(1);
}

if (!process.env.CLIENT_ID) {
    console.error('❌ ERROR: CLIENT_ID is not set in .env file');
    process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

// Deploy commands
(async () => {
    try {
        console.log(`Started refreshing ${commands.length} application (/) commands.`);

        // The put method is used to fully refresh all commands with the current set
        const data = await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands },
        );

        console.log(`✅ Successfully reloaded ${data.length} application (/) commands.`);
    } catch (error) {
        console.error('❌ Error deploying commands:', error);
    }
})();
