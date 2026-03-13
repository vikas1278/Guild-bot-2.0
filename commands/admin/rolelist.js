const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');

const ROLE_LINKS_PATH = path.join(__dirname, '../../role_links.json');

async function getRoleLinks() {
    try {
        const data = await fs.readFile(ROLE_LINKS_PATH, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        return [];
    }
}

async function isBotCommander(userId) {
    try {
        const data = await fs.readFile(path.join(__dirname, '../../commanderdb.json'), 'utf-8');
        const { commanders } = JSON.parse(data);
        return commanders.includes(userId) || userId === process.env.BOT_OWNER;
    } catch (error) {
        return false;
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rolelist')
        .setDescription('List linked roles for guilds (Bot Owner/Commander Only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option =>
            option.setName('guild_id')
                .setDescription('The ID of the guild to view roles for')
                .setRequired(false)),

    async execute(interaction) {
        await interaction.deferReply();

        // Check permissions
        const isCommander = await isBotCommander(interaction.user.id);
        if (!isCommander) {
            return interaction.editReply({
                content: '❌ This command can only be used by bot owners or commanders.'
            });
        }

        const targetGuildId = interaction.options.getString('guild_id');
        const roleLinks = await getRoleLinks();

        if (roleLinks.length === 0) {
            return interaction.editReply({
                content: 'ℹ️ No roles have been linked to any guilds yet.'
            });
        }

        if (targetGuildId) {
            // Show roles for specific guild
            const guildEntry = roleLinks.find(g => (g.ffmax_guild_id || g.guildId) === targetGuildId);

            if (!guildEntry) {
                return interaction.editReply({
                    content: `❌ No linked roles found for Guild ID: \`${targetGuildId}\``
                });
            }

            const embed = new EmbedBuilder()
                .setTitle(`Linked Roles for ${guildEntry.guild_name}`)
                .setDescription(`Guild ID: \`${guildEntry.ffmax_guild_id}\``)
                .setColor(0x0099FF)
                .setTimestamp();

            if (guildEntry.roles.length > 0) {
                const roleList = guildEntry.roles.map(r => `• **${r.name}** (\`${r.role_id}\`)`).join('\n');
                embed.addFields({ name: `Roles (${guildEntry.roles.length})`, value: roleList });
            } else {
                embed.setDescription(`Guild ID: \`${guildEntry.ffmax_guild_id}\`\n\nNo roles linked.`);
            }

            return interaction.editReply({ embeds: [embed] });

        } else {
            // Show all guilds with linked roles
            const embed = new EmbedBuilder()
                .setTitle('Guilds with Linked Roles')
                .setColor(0x0099FF)
                .setTimestamp();

            const description = roleLinks.map(g => {
                return `**${g.guild_name}** (\`${g.ffmax_guild_id}\`)\nLinked Roles: ${g.roles.length}`;
            }).join('\n\n');

            embed.setDescription(description || 'No guilds found.');

            return interaction.editReply({ embeds: [embed] });
        }
    }
};
