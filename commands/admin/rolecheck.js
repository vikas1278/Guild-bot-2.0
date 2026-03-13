const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

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

async function fetchGuilds() {
    try {
        const baseUrl = process.env.GUILD_API_ENDPOINT.split('?')[0];
        const response = await axios.get(baseUrl, {
            params: { action: 'all_guilds_summary' },
            headers: {
                'Authorization': `Bearer ${process.env.BEARER_TOKEN}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            timeout: 10000,
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
        console.error('[rolecheck] Error fetching guilds:', error.message);
        return [];
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rolecheck')
        .setDescription('Sync user roles based on their guild (Bot Owner/Commander Only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to check (defaults to you)')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('all')
                .setDescription('Check ALL members from the API (Reverse Sync)')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('guilds')
                .setDescription('Select a specific guild to sync')
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

        const checkAll = interaction.options.getBoolean('all');
        const checkGuilds = interaction.options.getBoolean('guilds');
        const targetUser = interaction.options.getUser('user') || interaction.user;

        // Load Role Links once
        const roleLinks = await getRoleLinks();

        // Helper function to sync a single member
        async function syncMember(member, apiUserData) {
            let changes = [];
            let errors = [];
            try {
                // Use provided API data instead of fetching again if available
                const userGuildId = apiUserData.guild_ffmax_id || apiUserData.ffmax_guild_id || apiUserData.guild_id;
                const userGuildName = apiUserData.guild || apiUserData.guild_name;

                if (!userGuildId) {
                    const allManagedRoleIds = new Set();
                    roleLinks.forEach(guild => guild.roles.forEach(role => allManagedRoleIds.add(role.role_id)));

                    for (const roleId of allManagedRoleIds) {
                        if (member.roles.cache.has(roleId)) {
                            try {
                                await member.roles.remove(roleId);
                                changes.push(`Removed: ${roleId}`);
                            } catch (e) {
                                errors.push(`Failed to remove role ${roleId}: ${e.message}`);
                            }
                        }
                    }
                    return { status: 'no_guild', user: member.user.username, changes, errors };
                }
                // Support both guildId and ffmax_guild_id keys in role_links.json
                const targetGuildEntry = roleLinks.find(g => String(g.guildId || g.ffmax_guild_id) === String(userGuildId));

                // Debug logging
                console.log(`[Debug] User: ${member.user.username} (${member.id})`);
                console.log(`[Debug] API Guild ID: ${userGuildId}`);
                console.log(`[Debug] Target Guild Entry:`, targetGuildEntry ? 'Found' : 'Not Found');

                // Roles the user SHOULD have
                const shouldHaveRoleIds = new Set();
                if (targetGuildEntry) {
                    targetGuildEntry.roles.forEach(r => shouldHaveRoleIds.add(r.role_id));
                }
                console.log(`[Debug] Should Have Roles:`, Array.from(shouldHaveRoleIds));

                // Get all managed roles
                const allManagedRoleIds = new Set();
                roleLinks.forEach(guild => {
                    guild.roles.forEach(role => allManagedRoleIds.add(role.role_id));
                });

                for (const managedRoleId of allManagedRoleIds) {
                    const hasRole = member.roles.cache.has(managedRoleId);
                    const shouldHave = shouldHaveRoleIds.has(managedRoleId);

                    if (shouldHave && !hasRole) {
                        try {
                            console.log(`[Debug] Attempting to add role ${managedRoleId} to ${member.user.username}`);
                            await member.roles.add(managedRoleId);
                            changes.push(`Added: ${managedRoleId}`);
                            console.log(`[Debug] Successfully added role ${managedRoleId}`);
                        } catch (e) {
                            console.error(`[Debug] Failed to add role ${managedRoleId}:`, e);
                            if (e.code === 10011) {
                                errors.push(`Role ${managedRoleId} not found (Unknown Role)`);
                            } else if (e.code === 50013) {
                                errors.push(`Missing permissions to add role ${managedRoleId}`);
                            } else {
                                errors.push(`Failed to add role ${managedRoleId}: ${e.message}`);
                            }
                        }
                    } else if (!shouldHave && hasRole) {
                        try {
                            console.log(`[Debug] Attempting to remove role ${managedRoleId} from ${member.user.username}`);
                            await member.roles.remove(managedRoleId);
                            changes.push(`Removed: ${managedRoleId}`);
                            console.log(`[Debug] Successfully removed role ${managedRoleId}`);
                        } catch (e) {
                            console.error(`[Debug] Failed to remove role ${managedRoleId}:`, e);
                            if (e.code === 10011) {
                                errors.push(`Role ${managedRoleId} not found (Unknown Role)`);
                            } else if (e.code === 50013) {
                                errors.push(`Missing permissions to remove role ${managedRoleId}`);
                            } else {
                                errors.push(`Failed to remove role ${managedRoleId}: ${e.message}`);
                            }
                        }
                    }
                }

                // Return status including unlinked guild info
                if (!targetGuildEntry) {
                    return {
                        status: changes.length > 0 ? 'updated_unlinked' : 'unlinked',
                        user: member.user.username,
                        guildName: userGuildName,
                        guildId: userGuildId,
                        changes,
                        errors
                    };
                }

                return {
                    status: (changes.length > 0 || errors.length > 0) ? 'processed' : 'synced',
                    user: member.user.username,
                    changes,
                    errors
                };

            } catch (error) {
                return { status: 'error', user: member.user.username, error: error.message, changes, errors };
            }
        }

        if (checkGuilds) {
            // Fetch guilds from API
            const guilds = await fetchGuilds();

            if (!guilds || guilds.length === 0) {
                return interaction.editReply({
                    content: '❌ No guilds found in the API.'
                });
            }

            // Create options for select menu
            const { ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
            const guildOptions = guilds.map(guild => {
                const effectiveGuildId = guild.ffmax_guild_id || guild.guildId || guild.uid || guild.id;
                const guildName = guild.guild_name || guild.name || `Guild ${effectiveGuildId}`;
                return {
                    label: guildName,
                    value: String(effectiveGuildId),
                    description: `ID: ${effectiveGuildId}`,
                    // Passed via temporary store
                };
            });

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('rolecheck_guild_select')
                .setPlaceholder('Select a guild to sync')
                .addOptions(guildOptions.slice(0, 25));

            const row = new ActionRowBuilder().addComponents(selectMenu);

            interaction.client.tempRolecheckData = {
                userId: interaction.user.id,
                allGuilds: guilds
            };

            return interaction.editReply({
                content: 'Select a guild to sync roles for:',
                components: [row]
            });
        }

        if (checkAll) {
            await interaction.editReply({ content: '🔄 Fetching member list from API... Please wait.' });

            let apiMembers = [];
            try {
                // Fetch members from LISTGUILDS_ENDPOINT
                // Remove limit or set it high to get all members if possible, otherwise use as is
                let apiUrl = process.env.listguilds_endpoint;
                if (apiUrl.includes('limit=')) {
                    apiUrl = apiUrl.replace(/limit=\d+/, 'limit=10000'); // Try to fetch more
                } else {
                    apiUrl += '&limit=10000';
                }

                const response = await axios.get(apiUrl, {
                    headers: {
                        'Authorization': `Bearer ${process.env.BEARER_TOKEN}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    timeout: 30000
                });

                // Handle various response formats
                if (Array.isArray(response.data)) {
                    apiMembers = response.data;
                } else if (response.data.data && Array.isArray(response.data.data)) {
                    apiMembers = response.data.data;
                } else if (response.data.items && Array.isArray(response.data.items)) {
                    apiMembers = response.data.items;
                } else {
                    console.error('Unexpected API response format:', response.data);
                    return interaction.editReply({ content: '❌ Unexpected API response format.' });
                }

            } catch (error) {
                console.error('Failed to fetch API members:', error);
                return interaction.editReply({ content: `❌ Failed to fetch members from API: ${error.message}` });
            }

            if (apiMembers.length === 0) {
                return interaction.editReply({ content: 'ℹ️ No members found in the API.' });
            }

            // Fetch all guilds to ensure we show even empty ones
            const allGuilds = await fetchGuilds();

            // Initialize membersByGuild with all guilds from the API
            const membersByGuild = {};
            for (const guild of allGuilds) {
                const guildName = guild.guild_name || guild.name || `Guild ${guild.ffmax_guild_id || guild.id}`;
                membersByGuild[guildName] = [];
            }

            // Now populate with actual members
            for (const apiMem of apiMembers) {
                const guildName = apiMem.guild || 'Unknown Guild';
                if (!membersByGuild[guildName]) membersByGuild[guildName] = [];
                membersByGuild[guildName].push(apiMem);
            }

            // Debug: Log first member to check structure
            if (apiMembers.length > 0) {
                console.log('[Debug] First API Member:', JSON.stringify(apiMembers[0], null, 2));
            }

            const embed = new EmbedBuilder()
                .setTitle('🔄 Reverse Role Sync Started')
                .setDescription(`Fetched ${apiMembers.length} members from API.\nProcessing guilds one by one...`)
                .setColor(0xFFFF00);

            await interaction.editReply({ content: null, embeds: [embed] });

            let totalUpdated = 0;
            let totalErrors = 0;
            let guildResults = [];

            // Process each guild (sorted alphabetically, with "Ex Hawk Eye" at the bottom)
            const sortedGuilds = Object.entries(membersByGuild).sort((a, b) => {
                const nameA = a[0].toLowerCase();
                const nameB = b[0].toLowerCase();
                
                const isExA = nameA.includes('ex hawk eye');
                const isExB = nameB.includes('ex hawk eye');
                
                if (isExA && !isExB) return 1;
                if (!isExA && isExB) return -1;
                
                return a[0].localeCompare(b[0], undefined, { numeric: true, sensitivity: 'base' });
            });

            for (const [guildName, guildMembers] of sortedGuilds) {
                let guildUpdated = 0;
                let guildErrors = 0;

                // Get guild ID - either from members or from allGuilds list
                let guildId;
                if (guildMembers.length > 0) {
                    const firstMem = guildMembers[0];
                    guildId = firstMem.guild_ffmax_id || firstMem.guild_id;
                } else {
                    // For empty guilds, find the guild in allGuilds
                    const guildInfo = allGuilds.find(g =>
                        (g.guild_name || g.name) === guildName
                    );
                    guildId = guildInfo ? (guildInfo.ffmax_guild_id || guildInfo.id) : null;
                }

                // Check against both possible ID fields
                const isLinked = guildId && roleLinks.some(g => String(g.guildId || g.ffmax_guild_id) === String(guildId));

                if (isLinked) {
                    console.log(`[Debug] Processing Guild: ${guildName} (${guildMembers.length} members)`);

                    for (const apiMem of guildMembers) {
                        // Check for both snake_case and camelCase
                        let discordId = apiMem.discord_id || apiMem.discordId;

                        if (!discordId) {
                            continue;
                        }

                        try {
                            // Check if member is in Discord
                            const member = await interaction.guild.members.fetch(discordId).catch(() => null);

                            if (member) {
                                const result = await syncMember(member, apiMem);

                                if (result.changes && result.changes.length > 0) {
                                    guildUpdated++;
                                    totalUpdated++;
                                }

                                if (result.errors && result.errors.length > 0) {
                                    guildErrors++;
                                    totalErrors++;
                                    // Log unique errors to console for admin
                                    result.errors.forEach(e => console.error(`[Role Error] ${member.user.username}: ${e}`));
                                }

                                if (result.status === 'error') {
                                    guildErrors++;
                                    totalErrors++;
                                }
                            } else {
                                // User defined in the API but not in the Discord server
                                guildErrors++;
                                totalErrors++;
                            }
                        } catch (e) {
                            console.error(`[Debug] Error processing member ${discordId}:`, e);
                            guildErrors++;
                            totalErrors++;
                        }

                        // Small delay to avoid rate limits
                        await new Promise(resolve => setTimeout(resolve, 200));
                    }
                } else {
                    console.log(`[Debug] Skipping unlinked guild: ${guildName} (ID: ${guildId})`);
                    guildResults.push(`**${guildName}**: Skipped (Unlinked)`);
                    continue;
                }

                guildResults.push(`**${guildName}**: Total: ${guildMembers.length} | Updated: ${guildUpdated} | Errors: ${guildErrors}`);

                // Update embed with results so far
                embed.setDescription(`Processing guilds...\n\n${guildResults.join('\n')}`);
                await interaction.editReply({ embeds: [embed] });
            }

            // Cleanup: find users with managed roles who are NOT in the API at all
            let removedStaleCount = 0;
            try {
                const apiDiscordIds = new Set(apiMembers.map(m => String(m.discord_id || m.discordId)).filter(Boolean));
                const allManagedRoleIds = new Set();
                roleLinks.forEach(guild => guild.roles.forEach(role => allManagedRoleIds.add(role.role_id)));

                const usersCleaned = new Set();

                await interaction.guild.members.fetch(); // Ensure cache is populated
                for (const roleId of allManagedRoleIds) {
                    const role = interaction.guild.roles.cache.get(roleId);
                    if (role) {
                        for (const [memberId, member] of role.members) {
                            if (!apiDiscordIds.has(String(memberId))) {
                                try {
                                    await member.roles.remove(roleId);
                                    usersCleaned.add(memberId);
                                    totalUpdated++;
                                } catch (e) {
                                    totalErrors++;
                                }
                            }
                        }
                    }
                }
                
                removedStaleCount = usersCleaned.size;
                
                if (removedStaleCount > 0) {
                    guildResults.push(`\n🧹 **Cleanup**: Removed stale roles from ${removedStaleCount} users not in any API guild.`);
                }
            } catch (cleanupErr) {
                console.error('Error during cleanup:', cleanupErr);
            }

            embed.setTitle('✅ Reverse Role Sync Complete')
                .setDescription(`Processed ${apiMembers.length} API members.\nTotal Updated: ${totalUpdated}\nTotal Errors: ${totalErrors}\n\n${guildResults.join('\n')}`)
                .setColor(totalErrors > 0 ? 0xFFA500 : 0x00FF00); // Orange if errors, Green if clean

            await interaction.editReply({ embeds: [embed] });

        } else {
            // Single User Logic
            let member;
            try {
                member = await interaction.guild.members.fetch(targetUser.id);
            } catch (error) {
                return interaction.editReply({ content: '❌ User not found in this server.' });
            }

            try {
                // 1. Fetch User Profile
                const apiUrl = `${process.env.PROFILE_API_ENDPOINT}${process.env.PROFILE_API_ENDPOINT.includes('?') ? '&' : '?'}discordId=${targetUser.id}`;

                const response = await axios.get(apiUrl, {
                    headers: {
                        'Authorization': `Bearer ${process.env.BEARER_TOKEN}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    timeout: 10000
                });

                const userData = response.data.data || response.data;

                // Reuse syncMember logic
                const result = await syncMember(member, userData);

                if (result.status === 'error') {
                    return interaction.editReply({ content: `❌ Error: ${result.error}` });
                }

                if (result.status === 'no_guild') {
                    if (result.changes && result.changes.length > 0) {
                        const embed = new EmbedBuilder()
                            .setTitle(`Role Sync: ${targetUser.username}`)
                            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                            .setColor(0x00FF00)
                            .setDescription('ℹ️ User is not in any API guild. Stale roles were removed.')
                            .addFields({ name: '🗑️ Roles Removed', value: result.changes.map(c => c.replace('Removed: ', '')).map(id => `<@&${id}>`).join('\n') });
                        return interaction.editReply({ content: null, embeds: [embed] });
                    } else {
                        return interaction.editReply({ content: `ℹ️ User **${targetUser.username}** is not in any guild, and has no managed guild roles.` });
                    }
                }

                // Construct Response based on result
                const embed = new EmbedBuilder()
                    .setTitle(`Role Sync: ${targetUser.username}`)
                    .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                    .setColor(result.status.includes('unlinked') ? 0xFFA500 : 0x00FF00);

                // Add Guild Info
                let guildName = result.guildName;
                let guildId = result.guildId;
                let isLinked = !result.status.includes('unlinked');

                if (isLinked) {
                    embed.addFields({ name: 'Linked Guild Found', value: 'Yes', inline: true });
                } else {
                    embed.addFields({ name: 'Linked Guild Found', value: 'No', inline: true });
                    embed.addFields({
                        name: '⚠️ Unlinked Guild',
                        value: `User is in **${guildName}** (ID: ${guildId}) but no roles are linked to this guild.`,
                        inline: false
                    });
                }

                const added = result.changes.filter(c => c.startsWith('Added')).map(c => c.replace('Added: ', ''));
                const removed = result.changes.filter(c => c.startsWith('Removed')).map(c => c.replace('Removed: ', ''));

                // Resolve Role Names
                const resolveName = (id) => {
                    for (const g of roleLinks) {
                        const r = g.roles.find(role => role.role_id === id);
                        if (r) return r.name;
                    }
                    return `<@&${id}>`;
                };

                if (added.length > 0) {
                    embed.addFields({ name: '✅ Roles Added', value: added.map(resolveName).join('\n') || 'None' });
                }

                if (removed.length > 0) {
                    embed.addFields({ name: '🗑️ Roles Removed', value: removed.map(resolveName).join('\n') || 'None' });
                }

                if (added.length === 0 && removed.length === 0 && (!result.errors || result.errors.length === 0)) {
                    if (!result.status.includes('unlinked')) {
                        embed.setDescription('✅ User roles are already in sync.');
                    }
                }

                if (result.errors && result.errors.length > 0) {
                    embed.addFields({
                        name: '❌ Errors Encountered',
                        value: result.errors.map(e => `• ${e}`).join('\n').slice(0, 1024)
                    });
                    embed.setColor(0xFF0000); // Red for errors
                }

                await interaction.editReply({ embeds: [embed] });

            } catch (error) {
                console.error('Error in rolecheck command:', error);
                
                if (error.response && error.response.status === 404) {
                    // Start of 404 cleanup logic
                    let removedRolesCount = 0;
                    let removedRolesList = [];
                    
                    try {
                        const allManagedRoleIds = new Set();
                        roleLinks.forEach(guild => guild.roles.forEach(role => allManagedRoleIds.add(role.role_id)));

                        for (const roleId of allManagedRoleIds) {
                            if (member.roles.cache.has(roleId)) {
                                try {
                                    await member.roles.remove(roleId);
                                    removedRolesCount++;
                                    removedRolesList.push(roleId);
                                } catch (e) {
                                    console.error(`Failed to remove role ${roleId} during 404 cleanup:`, e);
                                }
                            }
                        }

                        if (removedRolesCount > 0) {
                            const embed = new EmbedBuilder()
                                .setTitle(`Role Sync: ${targetUser.username}`)
                                .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                                .setColor(0xFFA500)
                                .setDescription('❌ User profile not found in API.')
                                .addFields({ 
                                    name: '🧹 Stale Roles Removed', 
                                    value: removedRolesList.map(id => `<@&${id}>`).join('\n') 
                                });
                            return interaction.editReply({ content: null, embeds: [embed] });
                        }
                    } catch (cleanupErr) {
                         console.error('Error executing 404 cleanup:', cleanupErr);
                    }
                    
                    // Fallback to simple error if no roles were removed or cleanup failed
                    return interaction.editReply({ content: '❌ User profile not found in API.' });
                }

                // Generic error handler
                let errorMessage = '❌ An error occurred while checking roles.';
                if (error.response) {
                    errorMessage = `❌ API Error: ${error.response.status}`;
                }
                await interaction.editReply({ content: errorMessage });
            }
        }
    },

    // Handle the select menu interaction
    async handleGuildSelect(interaction) {
        if (interaction.customId !== 'rolecheck_guild_select') return false;

        await interaction.deferUpdate();

        const { userId, allGuilds } = interaction.client.tempRolecheckData || {};

        if (interaction.user.id !== userId) {
            await interaction.followUp({
                content: '❌ Only the command initiator can select a guild.',
                ephemeral: true
            });
            return true;
        }

        const selectedId = interaction.values[0];
        const selectedGuild = allGuilds.find(g => {
            const effId = g.ffmax_guild_id || g.guildId || g.uid || g.id;
            return String(effId) === selectedId;
        });

        const guildName = selectedGuild ? (selectedGuild.guild_name || selectedGuild.name) : `Guild ID: ${selectedId}`;

        await interaction.editReply({ 
            content: `🔄 Fetching members for **${guildName}** from API... Please wait.`, 
            components: [] 
        });

        let apiMembers = [];
        try {
            let apiUrl = process.env.listguilds_endpoint;
            if (apiUrl.includes('limit=')) {
                apiUrl = apiUrl.replace(/limit=\d+/, 'limit=10000');
            } else {
                apiUrl += '&limit=10000';
            }

            const response = await axios.get(apiUrl, {
                headers: {
                    'Authorization': `Bearer ${process.env.BEARER_TOKEN}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                timeout: 30000
            });

            if (Array.isArray(response.data)) {
                apiMembers = response.data;
            } else if (response.data.data && Array.isArray(response.data.data)) {
                apiMembers = response.data.data;
            } else if (response.data.items && Array.isArray(response.data.items)) {
                apiMembers = response.data.items;
            } else {
                return interaction.editReply({ content: '❌ Unexpected API response format.' });
            }
        } catch (error) {
            return interaction.editReply({ content: `❌ Failed to fetch members: ${error.message}` });
        }

        // Filter API members to only include those in the selected guild
        const guildMembers = apiMembers.filter(m => {
            const mGuildId = m.guild_ffmax_id || m.ffmax_guild_id || m.guild_id;
            const mGuildName = m.guild || m.guild_name;
            return String(mGuildId) === selectedId || (mGuildName === guildName && !mGuildId);
        });

        if (guildMembers.length === 0) {
            return interaction.editReply({ content: `ℹ️ No members found in **${guildName}** via API.` });
        }

        const roleLinks = await getRoleLinks();
        const isLinked = roleLinks.some(g => String(g.guildId || g.ffmax_guild_id) === String(selectedId));

        if (!isLinked) {
            return interaction.editReply({ content: `⚠️ **${guildName}** is not linked to any roles. Use \`/rolelink\` first.` });
        }

        const embed = new EmbedBuilder()
            .setTitle(`🔄 Role Sync: ${guildName}`)
            .setDescription(`Processing ${guildMembers.length} members...`)
            .setColor(0xFFFF00);

        await interaction.editReply({ content: null, embeds: [embed] });

        let guildUpdated = 0;
        let guildErrors = 0;

        // Sync Logic from execute
        const syncMemberInner = async (member, apiUserData) => {
            let changes = [];
            let errors = [];
            try {
                const userGuildId = apiUserData.guild_ffmax_id || apiUserData.ffmax_guild_id || apiUserData.guild_id;
                if (!userGuildId) return { changes, errors };

                const targetGuildEntry = roleLinks.find(g => String(g.guildId || g.ffmax_guild_id) === String(userGuildId));
                
                const shouldHaveRoleIds = new Set();
                if (targetGuildEntry) {
                    targetGuildEntry.roles.forEach(r => shouldHaveRoleIds.add(r.role_id));
                }

                const allManagedRoleIds = new Set();
                
                // Only manage the roles explicitly linked to the target guild during specific guild checks
                if (targetGuildEntry) {
                    targetGuildEntry.roles.forEach(role => allManagedRoleIds.add(role.role_id));
                }

                for (const managedRoleId of allManagedRoleIds) {
                    const hasRole = member.roles.cache.has(managedRoleId);
                    const shouldHave = shouldHaveRoleIds.has(managedRoleId);

                    if (shouldHave && !hasRole) {
                        try {
                            await member.roles.add(managedRoleId);
                            changes.push(managedRoleId);
                        } catch (e) {
                            errors.push(`Role ${managedRoleId}: ${e.message}`);
                        }
                    } else if (!shouldHave && hasRole) {
                        try {
                            await member.roles.remove(managedRoleId);
                            changes.push(managedRoleId);
                        } catch (e) {
                            errors.push(`Role ${managedRoleId}: ${e.message}`);
                        }
                    }
                }
                return { changes, errors };
            } catch (error) {
                return { changes, errors: [error.message] };
            }
        };

        let unsyncedMembers = [];

        for (const apiMem of guildMembers) {
            let discordId = apiMem.discord_id || apiMem.discordId;
            const inGameName = apiMem.ign || apiMem.username || apiMem.game_name || apiMem.name || 'Unknown';
            
            if (!discordId) {
                guildErrors++;
                unsyncedMembers.push({ name: inGameName, reason: "No Discord ID linked" });
                continue;
            }

            try {
                const member = await interaction.guild.members.fetch(discordId).catch(() => null);
                if (member) {
                    const result = await syncMemberInner(member, apiMem);
                    if (result.changes && result.changes.length > 0) guildUpdated++;
                    if (result.errors && result.errors.length > 0) {
                        guildErrors++;
                        unsyncedMembers.push({ name: inGameName, id: discordId, reason: "Error applying roles" });
                    }
                } else {
                    guildErrors++;
                    unsyncedMembers.push({ name: inGameName, id: discordId, reason: "User not in server" });
                }
            } catch (e) {
                guildErrors++;
                unsyncedMembers.push({ name: inGameName, id: discordId, reason: "Error fetching member" });
            }
            await new Promise(resolve => setTimeout(resolve, 200));
        }

        // Cleanup for specific guild: remove role from anyone who has it but isn't in guildMembers
        try {
            const validGuildMemberDiscordIds = new Set(guildMembers.map(m => String(m.discord_id || m.discordId)).filter(Boolean));
            const allApiDiscordIds = new Set(apiMembers.map(m => String(m.discord_id || m.discordId)).filter(Boolean));
            
            const targetGuildEntry = roleLinks.find(g => String(g.guildId || g.ffmax_guild_id) === String(selectedId));

            // Precompute role sharing to prevent removing shared roles like "Hawk Eye ⭐" from members of other guilds
            const roleUsageCount = {};
            roleLinks.forEach(g => {
                g.roles.forEach(r => {
                    roleUsageCount[r.role_id] = (roleUsageCount[r.role_id] || 0) + 1;
                });
            });
            
            const usersCleanedInGuild = new Set();
            
            if (targetGuildEntry) {
                await interaction.guild.members.fetch();
                for (const roleObj of targetGuildEntry.roles) {
                    const roleId = roleObj.role_id;
                    const isShared = roleUsageCount[roleId] > 1;
                    const role = interaction.guild.roles.cache.get(roleId);
                    
                    if (role) {
                        for (const [memberId, member] of role.members) {
                            // If shared role, only remove if they are not in ANY guild
                            // If unique role, remove if they are not in THIS guild
                            const shouldRemove = isShared ? !allApiDiscordIds.has(String(memberId)) : !validGuildMemberDiscordIds.has(String(memberId));
                            
                            if (shouldRemove) {
                                try {
                                    await member.roles.remove(roleId);
                                    guildUpdated++;
                                    if (!usersCleanedInGuild.has(memberId)) {
                                        unsyncedMembers.push({ name: member.user.username, id: memberId, reason: "Stale role removed (left guild)" });
                                        usersCleanedInGuild.add(memberId);
                                    }
                                } catch (e) {
                                    guildErrors++;
                                }
                            }
                        }
                    }
                }
            }
        } catch (cleanupErr) {
            console.error('Error during specific guild cleanup:', cleanupErr);
        }

        embed.setTitle(`✅ Role Sync Complete: ${guildName}`)
            .setDescription(`Total Members: ${guildMembers.length}\nSuccessfully Updated: ${guildUpdated}\nErrors Encountered: ${guildErrors}`)
            .setColor(guildErrors > 0 ? 0xFFA500 : 0x00FF00);

        if (unsyncedMembers.length > 0) {
            // chunk the unsynced members if the list is too long for an embed field (max 1024 chars)
            let unsyncedText = unsyncedMembers.map(m => `**${m.name}** ${m.id ? `(<@${m.id}>)` : ''} - *${m.reason}*`).join('\n');
            if (unsyncedText.length > 1024) {
                unsyncedText = unsyncedText.substring(0, 1000) + '... (and more)';
            }
            embed.addFields({ name: '⚠️ Unsynced Members', value: unsyncedText });
        }

        if (guildErrors > 0) embed.setFooter({ text: 'Check console for detailed errors.' });

        await interaction.editReply({ embeds: [embed] });
        
        // Clean up
        delete interaction.client.tempRolecheckData;
        return true;
    }
};
