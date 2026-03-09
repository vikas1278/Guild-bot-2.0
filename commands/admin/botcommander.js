const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const COMMANDER_DB_PATH = path.join(__dirname, '../../commanderdb.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('botcommander')
        .setDescription('Manage bot commanders (Bot Owner Only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Add a bot commander')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to add as bot commander')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove a bot commander')
                .addStringOption(option =>
                    option.setName('user')
                        .setDescription('The user ID to remove from bot commanders')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all bot commanders')),

    async execute(interaction) {
        // Check if the user is the bot owner
        if (interaction.user.id !== process.env.BOT_OWNER) {
            return interaction.reply({ 
                content: '❌ This command can only be used by the bot owner.', 
                ephemeral: true 
            });
        }

        const subcommand = interaction.options.getSubcommand();

        try {
            // Read the current commanders
            let commanders = [];
            try {
                const data = await fs.readFile(COMMANDER_DB_PATH, 'utf-8');
                commanders = JSON.parse(data).commanders || [];
            } catch (error) {
                // File doesn't exist or is invalid, will be created on save
                console.log('No existing commander database found, creating a new one.');
            }

            switch (subcommand) {
                case 'add': {
                    const user = interaction.options.getUser('user');
                    
                    // Check if user is already a commander
                    if (commanders.includes(user.id)) {
                        return interaction.reply({ 
                            content: `❌ <@${user.id}> is already a bot commander.`,
                            ephemeral: true
                        });
                    }

                    // Add the new commander
                    commanders.push(user.id);
                    await this.saveCommanders(commanders);
                    
                    return interaction.reply({
                        content: `✅ Successfully added <@${user.id}> as a bot commander.`,
                        ephemeral: true
                    });
                }

                case 'remove': {
                    const userId = interaction.options.getString('user');
                    
                    // Remove @ mention if present
                    const cleanUserId = userId.replace(/[<@!>]/g, '');
                    
                    const index = commanders.indexOf(cleanUserId);
                    if (index === -1) {
                        return interaction.reply({
                            content: `❌ User with ID ${cleanUserId} is not a bot commander.`,
                            ephemeral: true
                        });
                    }

                    commanders.splice(index, 1);
                    await this.saveCommanders(commanders);
                    
                    return interaction.reply({
                        content: `✅ Successfully removed <@${cleanUserId}> from bot commanders.`,
                        ephemeral: true
                    });
                }

                case 'list': {
                    if (commanders.length === 0) {
                        return interaction.reply({
                            content: 'There are no bot commanders set up yet.',
                            ephemeral: true
                        });
                    }

                    const commanderList = commanders.map(id => `• <@${id}> - (${id})`).join('\n');
                    const embed = new EmbedBuilder()
                        .setTitle('Bot Commanders:')
                        .setDescription(commanderList)
                        .setColor(0x5865F2);

                    return interaction.reply({
                        embeds: [embed]
                    });
                }
            }
        } catch (error) {
            console.error('Error in botcommander command:', error);
            return interaction.reply({
                content: '❌ An error occurred while processing your request.',
                ephemeral: true
            });
        }
    },

    // Helper function to save commanders to file
    async saveCommanders(commanders) {
        await fs.writeFile(
            COMMANDER_DB_PATH,
            JSON.stringify({ commanders: [...new Set(commanders)] }, null, 2),
            'utf-8'
        );
    }
};
