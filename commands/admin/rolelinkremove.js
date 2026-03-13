const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');

const axios = require('axios');

const ROLE_LINKS_PATH = path.join(__dirname, '../../role_links.json');
const GUILD_API_ENDPOINT = process.env.GUILD_API_ENDPOINT;
const BEARER_TOKEN = process.env.BEARER_TOKEN;

async function getRoleLinks() {
    try {
        const data = await fs.readFile(ROLE_LINKS_PATH, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        return [];
    }
}

async function fetchGuilds() {
    try {
        // Safe base URL extraction (ignores existing query params in .env)
        const baseUrl = GUILD_API_ENDPOINT.split('?')[0];
        // console.log(`[rolelinkremove] Fetching guilds from: ${baseUrl}`);

        const response = await axios.get(baseUrl, {
            params: { action: 'all_guilds_summary' },
            headers: {
                'Authorization': `Bearer ${BEARER_TOKEN}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            timeout: 5000,
            validateStatus: status => status < 500
        });

        if (response.data && response.data.items && Array.isArray(response.data.items)) {
            return response.data.items;
        } else if (Array.isArray(response.data)) {
            return response.data;
        } else if (response.data && response.data.guilds) {
            return response.data.guilds;
        }
        return [];
    } catch (error) {
        console.error('[rolelinkremove] Error fetching guilds for name resolution:', error.message);
        return [];
    }
}

async function saveRoleLinks(links) {
    try {
        const jsonString = '[\n' + links.map(link => '  ' + JSON.stringify(link)).join(',\n') + '\n]';
        await fs.writeFile(ROLE_LINKS_PATH, jsonString, 'utf-8');
        return true;
    } catch (error) {
        console.error('[rolelinkremove] Error saving role links:', error);
        throw new Error('Failed to save role links to file');
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
        .setName('rolelinkremove')
        .setDescription('Remove linked roles for a guild (Bot Owner/Commander Only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const isCommander = await isBotCommander(interaction.user.id);
        if (!isCommander) {
            return interaction.editReply({
                content: '❌ This command can only be used by bot owners or commanders.'
            });
        }

        const roleLinks = await getRoleLinks();

        if (roleLinks.length === 0) {
            return interaction.editReply({
                content: '❌ No role links found.'
            });
        }

        // Fetch current guild data from API to resolve names
        const apiGuilds = await fetchGuilds();

        const guildOptions = roleLinks.map((guild, index) => {
            const gid = guild.ffmax_guild_id || guild.guildId || `unknown-${index}`;

            // Try to find the real name from API data
            let realName = guild.guild_name;

            // If local name is missing or "Unnamed Guild", try to resolve from API
            if (!realName || realName === 'Unnamed Guild') {
                const apiGuild = apiGuilds.find(g =>
                    String(g.ffmax_guild_id) === String(gid) ||
                    String(g.guildId) === String(gid) ||
                    String(g.id) === String(gid)
                );
                if (apiGuild) {
                    realName = apiGuild.guild_name || apiGuild.name;
                }
            }

            return {
                label: (realName || `Guild ${gid}`).slice(0, 100),
                value: String(index),
                description: `ID: ${gid} | Roles: ${guild.roles.length}`.slice(0, 100)
            };
        });

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('rolelinkremove_select')
            .setPlaceholder('Select a guild to remove role links')
            .addOptions(guildOptions.slice(0, 25));

        const row = new ActionRowBuilder().addComponents(selectMenu);

        interaction.client.tempRemoveData = {
            userId: interaction.user.id,
            roleLinks,
            apiGuilds
        };

        await interaction.editReply({
            content: 'Select a guild to remove its role links:',
            components: [row]
        });
    },

    async handleGuildSelect(interaction) {
        if (interaction.customId !== 'rolelinkremove_select') return;

        await interaction.deferUpdate();

        const { userId, roleLinks, apiGuilds } = interaction.client.tempRemoveData || {};

        if (interaction.user.id !== userId) {
            await interaction.followUp({ content: '❌ Only the command initiator can select a guild.', ephemeral: true });
            return;
        }

        const selectedIndex = parseInt(interaction.values[0], 10);

        if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= roleLinks.length) {
            await interaction.followUp({ content: '❌ Invalid selection.', ephemeral: true });
            return;
        }

        const removedGuild = roleLinks[selectedIndex];
        roleLinks.splice(selectedIndex, 1);

        try {
            await saveRoleLinks(roleLinks);

            // Resolve name for the success message
            const gid = removedGuild.ffmax_guild_id || removedGuild.guildId;
            let realName = removedGuild.guild_name;

            if ((!realName || realName === 'Unnamed Guild') && apiGuilds) {
                const apiGuild = apiGuilds.find(g =>
                    String(g.ffmax_guild_id) === String(gid) ||
                    String(g.guildId) === String(gid) ||
                    String(g.id) === String(gid)
                );
                if (apiGuild) {
                    realName = apiGuild.guild_name || apiGuild.name;
                }
            }

            await interaction.editReply({
                content: `✅ Successfully removed role links for **${realName || 'Unnamed Guild'}** (ID: ${gid}).`,
                components: []
            });
        } catch (error) {
            await interaction.followUp({ content: '❌ Failed to save changes.', ephemeral: true });
        }

        delete interaction.client.tempRemoveData;
    }
};
