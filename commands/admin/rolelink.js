const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');

const ROLE_LINKS_PATH = path.join(__dirname, '../../role_links.json');
const GUILD_API_ENDPOINT = process.env.GUILD_API_ENDPOINT || 'https://guildmanager.hawkeyeofficial.com/api/guild-management.php?action=all_guilds_summary';
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
        const baseUrl = GUILD_API_ENDPOINT.split('?')[0];
        console.log(`[rolelink] Fetching guilds from: ${baseUrl}`);

        const response = await axios.get(baseUrl, {
            params: {
                action: 'all_guilds_summary'
            },
            headers: {
                'Authorization': `Bearer ${BEARER_TOKEN}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            timeout: 10000,
            validateStatus: status => status < 500
        });

        console.log(`[rolelink] API Response Status: ${response.status}`);
        console.log('[rolelink] Response Data:', JSON.stringify(response.data, null, 2));

        // Handle different response formats
        if (response.data && response.data.items && Array.isArray(response.data.items)) {
            return response.data.items;
        } else if (Array.isArray(response.data)) {
            return response.data;
        } else if (response.data && response.data.guilds) {
            return response.data.guilds;
        }

        console.error('[rolelink] Unexpected API response format:', response.data);
        return [];
    } catch (error) {
        console.error('[rolelink] Error fetching guilds:', error.message);
        if (error.response) {
            console.error('[rolelink] Error response data:', error.response.data);
            console.error('[rolelink] Error response status:', error.response.status);
            console.error('[rolelink] Error response headers:', error.response.headers);
        } else if (error.request) {
            console.error('[rolelink] No response received:', error.request);
        } else {
            console.error('[rolelink] Error setting up request:', error.message);
        }
        return [];
    }
}

async function saveRoleLinks(links) {
    try {
        // Ensure the directory exists
        const dir = path.dirname(ROLE_LINKS_PATH);
        await fs.mkdir(dir, { recursive: true });

        // Write the file with proper error handling
        await fs.writeFile(ROLE_LINKS_PATH, JSON.stringify(links, null, 2), 'utf-8');
        console.log(`[rolelink] Successfully saved ${links.length} guild entries to ${ROLE_LINKS_PATH}`);
        return true;
    } catch (error) {
        console.error('[rolelink] Error saving role links:', error);
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
        .setName('rolelink')
        .setDescription('Link roles to guilds (Bot Owner/Commander Only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addRoleOption(option =>
            option.setName('role1')
                .setDescription('The first role to link')
                .setRequired(true))
        .addRoleOption(option =>
            option.setName('role2')
                .setDescription('The second role to link (optional)')
                .setRequired(false)),

    async execute(interaction) {
        // Defer the reply to give us more time
        await interaction.deferReply({ ephemeral: true });

        // Check permissions
        const isCommander = await isBotCommander(interaction.user.id);
        if (!isCommander) {
            return interaction.editReply({
                content: '❌ This command can only be used by bot owners or commanders.'
            });
        }

        const role1 = interaction.options.getRole('role1');
        const role2 = interaction.options.getRole('role2');

        // Validate role IDs
        const validRoles = [];
        const invalidRoles = [];

        if (role1) {
            validRoles.push({
                role_id: role1.id,
                name: role1.name
            });
        }

        if (role2) {
            validRoles.push({
                role_id: role2.id,
                name: role2.name
            });
        }

        if (validRoles.length === 0) {
            return interaction.editReply({
                content: '❌ No valid roles provided.'
            });
        }

        // Fetch guilds from API
        const guilds = await fetchGuilds();

        if (!guilds || guilds.length === 0) {
            return interaction.editReply({
                content: '❌ No guilds found in the API.'
            });
        }

        // Format guilds for the select menu
        // Format guilds for the select menu
        const guildOptions = guilds.map(guild => {
            // Priority: ffmax_guild_id > guildId > uid > id
            const effectiveGuildId = guild.ffmax_guild_id || guild.guildId || guild.uid || guild.id;
            const guildName = guild.guild_name || guild.name || `Guild ${effectiveGuildId}`;
            return {
                label: guildName,
                value: String(effectiveGuildId), // Ensure value is a string
                description: `ID: ${effectiveGuildId}`,
                name: guildName,
                // Add guild data as custom properties if needed later
                guildData: guild
            };
        });

        // Create select menu for guilds with pagination if needed
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('rolelink_guild_select')
            .setPlaceholder('Select a guild to link roles to')
            .addOptions(guildOptions.slice(0, 25)); // Discord allows max 25 options

        const row = new ActionRowBuilder().addComponents(selectMenu);

        // Store valid roles and guild data in the interaction for later use
        interaction.client.tempRoleData = {
            userId: interaction.user.id,
            validRoles,
            invalidRoles,
            allGuilds: guilds
        };

        let response = 'Select a guild to link the roles to:';
        if (invalidRoles.length > 0) {
            response = `⚠️ The following role IDs are invalid and will be skipped: ${invalidRoles.join(', ')}\n\n${response}`;
        }
        if (guilds.length > 25) {
            response += `\n\nℹ️ Showing first 25 of ${guilds.length} guilds.`;
        }

        await interaction.editReply({
            content: response,
            components: [row]
        });
    },

    // This will be called from the interactionCreate event
    async handleGuildSelect(interaction) {
        if (interaction.customId !== 'rolelink_guild_select') return false;

        // Defer the update to prevent interaction timeout
        await interaction.deferUpdate();

        const { userId, validRoles, invalidRoles, allGuilds } = interaction.client.tempRoleData || {};

        // Verify the user is the one who initiated the command
        if (interaction.user.id !== userId) {
            await interaction.followUp({
                content: '❌ Only the command initiator can select a guild.',
                ephemeral: true
            });
            return true;
        }

        const selectedId = interaction.values[0];

        try {
            // Find the guild in our cached guild data
            // We need to match against the effective ID we used in the options
            const guild = allGuilds.find(g => {
                const effId = g.ffmax_guild_id || g.guildId || g.uid || g.id;
                return String(effId) === selectedId;
            });

            if (!guild) {
                await interaction.followUp({
                    content: '❌ Guild not found in the API.',
                    ephemeral: true
                });
                return true;
            }

            // Get existing role links
            const roleLinks = await getRoleLinks();

            // Find or create guild entry using guildId
            let guildEntry = roleLinks.find(g => (g.ffmax_guild_id || g.guildId) === selectedId);

            const guildName = guild.guild_name || guild.name || `Guild ${selectedId}`;

            if (!guildEntry) {
                guildEntry = {
                    ffmax_guild_id: selectedId,
                    guild_name: guildName,
                    roles: []
                };
                roleLinks.push(guildEntry);
            }

            // Add new roles, avoiding duplicates
            const existingRoleIds = new Set(guildEntry.roles.map(r => r.role_id));
            const newRoles = validRoles.filter(role => !existingRoleIds.has(role.role_id));

            if (newRoles.length === 0) {
                await interaction.followUp({
                    content: 'All provided roles are already linked to this guild.',
                    ephemeral: true
                });
                return true;
            }

            // Add new roles
            guildEntry.roles.push(...newRoles);

            // Save to file and prepare response
            let response;
            try {
                await saveRoleLinks(roleLinks);

                // Prepare success response
                response = `✅ Successfully linked ${newRoles.length} role(s) to ${guildName}:\n`;
                response += newRoles.map(r => `- ${r.name} (${r.role_id})`).join('\n');
            } catch (saveError) {
                console.error('Failed to save role links:', saveError);
                await interaction.followUp({
                    content: '❌ Failed to save role links. Please try again or contact an administrator.',
                    ephemeral: true
                });
                return true;
            }

            // Add invalid roles to response if any
            if (invalidRoles.length > 0) {
                response += `\n\n⚠️ The following role IDs were invalid: ${invalidRoles.join(', ')}`;
            }

            // Add a note about existing roles if any were skipped
            const skippedRoles = validRoles.length - newRoles.length;
            if (skippedRoles > 0) {
                response += `\n\nℹ️ ${skippedRoles} role(s) were already linked to this guild.`;
            }

            // Add view link to see all linked roles
            response += `\n\n🔗 View all linked roles with: \`/rolelist ${selectedId}\``;

            try {
                // Edit the original response
                await interaction.editReply({
                    content: response,
                    components: []
                });
            } catch (editError) {
                console.error('Failed to edit interaction:', editError);
                await interaction.followUp({
                    content: '✅ Role link successful! However, there was an issue updating the message.',
                    ephemeral: true
                });
            }

        } catch (error) {
            console.error('Error in rolelink command:', error);
            try {
                await interaction.followUp({
                    content: '❌ An error occurred while processing your request.',
                    ephemeral: true
                });
            } catch (e) {
                console.error('Failed to send error message:', e);
            }
        }

        // Clean up
        delete interaction.client.tempRoleData;
        return true;
    }
};
