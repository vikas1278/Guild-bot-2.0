const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');

async function isBotCommander(userId) {
    try {
        const data = await fs.readFile(path.join(__dirname, '../../commanderdb.json'), 'utf-8');
        const { commanders } = JSON.parse(data);
        return commanders.includes(userId) || userId === process.env.BOT_OWNER;
    } catch {
        return userId === process.env.BOT_OWNER;
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('List all available bot commands'),

    async execute(interaction) {
        const isCommander = await isBotCommander(interaction.user.id);

        const embed = new EmbedBuilder()
            .setTitle('📚 Hawk Eye Bot — Commands')
            .setColor(0x5865F2)
            .setFooter({ text: 'Hawk Eye Official | Developed by Vikas Singh' })
            .setTimestamp();

        if (isCommander) {
            embed.addFields({
                name: '🛡️ Admin',
                value: [
                    '`/autorolesync` — Manage automated role & rank sync (run/start/stop/status)',
                    '`/rolecheck` — Sync guild roles for a user or all members',
                    '`/rankcheck` — Sync rank roles for a user or all members',
                    '`/rolelink` — Link Discord roles to a guild',
                    '`/rolelinkremove` — Remove a linked role from a guild',
                    '`/rolelist` — View all role-guild links',
                    '`/ranklink` — Link a Discord role to an in-game rank',
                    '`/botcommander` — Manage bot commander access',
                ].join('\n'),
                inline: false
            });
        }

        embed.addFields({
            name: '🏰 Guild',
            value: [
                '`/guilds` — List all Hawk Eye guilds with member counts',
                '`/memberlist` — View members of a specific guild',
                '`/banlist` — View the guild ban list',
            ].join('\n'),
            inline: false
        });

        embed.addFields({
            name: '👤 User',
            value: [
                '`/profile [@user]` — View a member\'s in-game profile',
                '`/help` — Show this command list',
            ].join('\n'),
            inline: false
        });

        await interaction.reply({ embeds: [embed] });
    },
};
