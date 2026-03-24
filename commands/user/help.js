const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ComponentType } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');

async function isBotCommander(userId) {
    try {
        const data = await fs.readFile(path.join(__dirname, '../../commanderdb.json'), 'utf-8');
        const { commanders } = JSON.parse(data);
        const owners = (process.env.BOT_OWNER || '').split(',').map(id => id.trim()).filter(Boolean);
        return commanders.includes(userId) || owners.includes(userId);
    } catch {
        const owners = (process.env.BOT_OWNER || '').split(',').map(id => id.trim()).filter(Boolean);
        return owners.includes(userId);
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Navigate through all available bot commands'),

    async execute(interaction) {
        const isCommander = await isBotCommander(interaction.user.id);
        const ownerName = process.env.OWNER_NAME || 'Developer';

        // Define command categories and their data
        const categories = {
            home: {
                title: '📚 Guild Manager Bot — Help Menu',
                description: `Welcome to the **Guild Manager Bot** help menu. Use the selection menu below to navigate through different command categories.\n\n**Categories:**\n🛡️ **Admin** — System management & sync tools (Commanders only)\n🏰 **Guild** — Manage and view guild-related information\n👤 **User** — Profile lookups and general utilities`,
                color: 0x5865F2,
                image: interaction.client.user.displayAvatarURL({ dynamic: true, size: 256 })
            },
            admin: {
                title: '🛡️ Admin Commands',
                description: 'Critical system tools for role synchronization and administration.',
                commands: [
                    '**`/autorolesync`** — Manage automation\n└ `run`, `status`, `stop`, `start`, `set-channel`, `clear`',
                    '**`/rolecheck`** — Sync guild roles\n└ `[user]`, `[all]`, `[guilds]`',
                    '**`/rankcheck`** — Sync rank roles\n└ `[user]`, `[all]`, `[rank]`',
                    '**`/blacklist role`** — Manage blacklist\n└ `add`, `delete`, `check`',
                    '**`/botcommander`** — Admin access\n└ `add`, `remove`, `list`',
                    '**`/rolelink`** — Link Discord roles to specific guilds.',
                    '**`/rolelinkremove`** — Remove an existing role-guild link.',
                    '**`/rolelist`** — View all active role-guild associations.',
                    '**`/ranklink`** — Associate Discord roles with in-game ranks.'
                ],
                color: 0xFF4B4B // Reddish for Admin
            },
            guild: {
                title: '🏰 Guild Commands',
                description: 'Access information about Hawk Eye guilds and their members.',
                commands: [
                    '**`/guilds`** — Overview of all Hawk Eye guilds.',
                    '**`/guildinfo`** — Details and leadership for a guild.',
                    '**`/memberlist`** — Detailed list of guild members.',
                    '**`/banlist`** — Review the current guild ban list.'
                ],
                color: 0x4BCBFF // Blue-sky for Guild
            },
            user: {
                title: '👤 User Commands',
                description: 'General utilities and profile lookup commands.',
                commands: [
                    '**`/profile`** — Look up an in-game player profile.',
                    '**`/web`** — Visit the Hawk Eye Guild Manager website.',
                    '**`/help`** — Re-open this interactive menu.'
                ],
                color: 0x60F542 // Green for User
            }
        };


        // Function to generate the embed for a category
        const generateEmbed = (categoryKey) => {
            const cat = categories[categoryKey];
            const embed = new EmbedBuilder()
                .setTitle(cat.title)
                .setDescription(cat.description)
                .setColor(cat.color)
                .setFooter({ text: `Guild Manager Official | Developed by ${ownerName}` })
                .setTimestamp();

            if (cat.image) embed.setThumbnail(cat.image);
            if (cat.commands) {
                embed.addFields({ name: 'Commands', value: cat.commands.join('\n') });
            }

            return embed;
        };

        // Create the Select Menu
        const menuOptions = [
            {
                label: 'Home',
                description: 'Back to the main menu',
                value: 'home',
                emoji: '🏠'
            },
            {
                label: 'Guild',
                description: 'Guild management & info',
                value: 'guild',
                emoji: '🏰'
            },
            {
                label: 'User',
                description: 'General user commands',
                value: 'user',
                emoji: '👤'
            }
        ];

        if (isCommander) {
            menuOptions.splice(1, 0, {
                label: 'Admin',
                description: 'System & Sync management',
                value: 'admin',
                emoji: '🛡️'
            });
        }

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('help_category')
            .setPlaceholder('Select a category...')
            .addOptions(menuOptions);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        // Send the initial reply
        const response = await interaction.reply({
            embeds: [generateEmbed('home')],
            components: [row]
        });

        // Set up Interaction Collector
        const collector = response.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            time: 60000 // 1 minute
        });

        collector.on('collect', async i => {
            if (i.user.id !== interaction.user.id) {
                return i.reply({ content: 'Only the user who ran the command can use this menu.', flags: 64 });
            }

            const selection = i.values[0];
            await i.update({
                embeds: [generateEmbed(selection)],
                components: [row]
            });
        });

        collector.on('end', () => {
            const disabledRow = new ActionRowBuilder().addComponents(
                selectMenu.setDisabled(true).setPlaceholder('Help session expired')
            );
            interaction.editReply({ components: [disabledRow] }).catch(() => {});
        });
    },
};

