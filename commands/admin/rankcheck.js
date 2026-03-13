const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const RANK_LINKS_PATH = path.join(__dirname, '../../rank_links.json');

async function getRankLinks() {
    try {
        const data = await fs.readFile(RANK_LINKS_PATH, 'utf-8');
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
        .setName('rankcheck')
        .setDescription('Sync user rank roles globally (Bot Owner/Commander Only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to check (defaults to you)')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('all')
                .setDescription('Check ALL members from the API')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('rank')
                .setDescription('Filter by a specific rank')
                .setRequired(false)
                .addChoices(
                    { name: 'Leader', value: 'leader' },
                    { name: 'Acting Guild Leader', value: 'agl' },
                    { name: 'Officer', value: 'officer' }
                )),

    async execute(interaction) {
        await interaction.deferReply();

        // Check permissions
        const isCommander = await isBotCommander(interaction.user.id);
        if (!isCommander) {
            return interaction.editReply({
                content: '❌ This command can only be used by bot owners or commanders.'
            });
        }

        const selectedRank = interaction.options.getString('rank'); // Filter by this rank if provided
        const targetUser = interaction.options.getUser('user') || interaction.user;
        // If a specific rank is selected, always scan all members (rank filter implies all-mode)
        const checkAll = interaction.options.getBoolean('all') || !!selectedRank;

        // Load Rank Links once
        const rankLinks = await getRankLinks();

        if (rankLinks.length === 0) {
            return interaction.editReply({
                content: '❌ No rank links are configured. Use `/ranklink` first.'
            });
        }

        // Helper function to sync a single member
        async function syncMember(member, apiUserData) {
            let changes = [];
            let errors = [];
            try {
                // The expected rank of the user according to the API
                const userRank = (apiUserData.rank || apiUserData.ign_rank || '').trim(); 

                // Get all managed rank role configurations
                const allManagedRankRoles = new Set();
                rankLinks.forEach(link => allManagedRankRoles.add(link.role_id));

                // Determine if we are focusing on a specific rank
                let targetRoleId = null;
                if (selectedRank) {
                    const specificLink = rankLinks.find(link => 
                        link.rank_name.toLowerCase() === selectedRank.toLowerCase()
                    );
                    targetRoleId = specificLink ? specificLink.role_id : 'NO_ROLE_FOR_THIS_RANK';
                }

                const expectedRankLink = rankLinks.find(link => 
                    link.rank_name.toLowerCase() === userRank.toLowerCase()
                );
                const expectedRoleId = expectedRankLink ? expectedRankLink.role_id : null;

                for (const managedRoleId of allManagedRankRoles) {
                    const hasRole = member.roles.cache.has(managedRoleId);
                    
                    // If we selected a specific rank, we ONLY care about that rank's role
                    // and whether the user SHOULD have it or NOT.
                    // However, to keep it consistent with "remove role if rank lost", 
                    // we check if they should have THIS managed role.
                    const shouldHave = (managedRoleId === expectedRoleId);

                    // Optimization: If a specific rank was selected for global sync, 
                    // we only care about processing the specific role for that rank.
                    if (selectedRank && targetRoleId !== managedRoleId) {
                        continue;
                    }

                    if (shouldHave && !hasRole) {
                        try {
                            await member.roles.add(managedRoleId);
                            changes.push(`Added: ${managedRoleId}`);
                        } catch (e) {
                            errors.push(`Failed to add role ${managedRoleId}: ${e.message}`);
                        }
                    } else if (!shouldHave && hasRole) {
                        try {
                            await member.roles.remove(managedRoleId);
                            changes.push(`Removed: ${managedRoleId}`);
                        } catch (e) {
                            errors.push(`Failed to remove role ${managedRoleId}: ${e.message}`);
                        }
                    }
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

        if (checkAll) {
            await interaction.editReply({ content: `🔄 Fetching members from API${selectedRank ? ` (rank: **${selectedRank}**)` : ''}... Please wait.` });

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

                apiMembers = response.data.data || response.data.items || response.data || [];
                if (!Array.isArray(apiMembers)) {
                    return interaction.editReply({ content: '❌ Unexpected API response format.' });
                }

            } catch (error) {
                console.error('Failed to fetch API members:', error);
                return interaction.editReply({ content: `❌ Failed to fetch members from API: ${error.message}` });
            }

            // Only process members who have a discord_id
            const membersWithId = apiMembers.filter(m => m.discord_id || m.discordId);

            if (membersWithId.length === 0) {
                return interaction.editReply({ content: 'ℹ️ No members with Discord IDs found in the API.' });
            }

            const embed = new EmbedBuilder()
                .setTitle(`🔄 Rank Sync Started ${selectedRank ? `(${selectedRank})` : ''}`)
                .setDescription(`Found ${membersWithId.length} members with Discord IDs. Processing...`)
                .setColor(0xFFFF00);

            await interaction.editReply({ content: null, embeds: [embed] });

            let totalUpdated = 0;
            let totalErrors = 0;
            let processedCount = 0;
            
            for (const apiMem of membersWithId) {
                const discordId = apiMem.discord_id || apiMem.discordId;
                if (!discordId) continue;

                try {
                    const member = await interaction.guild.members.fetch(discordId).catch(() => null);
                    if (!member) continue;

                    // The rank comes directly from the listguilds API response
                    const userRank = (apiMem.rank || apiMem.ign_rank || '').trim().toLowerCase();
                    const hasManagedRankRole = rankLinks.some(l => member.roles.cache.has(l.role_id));

                    // If filtering by specific rank: only process members who match the rank in API 
                    // OR who already have a rank role in Discord that may need removing
                    if (selectedRank) {
                        const matchesSelected = (userRank === selectedRank.toLowerCase());
                        if (!matchesSelected && !hasManagedRankRole) continue;
                    }

                    processedCount++;
                    const result = await syncMember(member, apiMem);

                    if (result.changes && result.changes.length > 0) totalUpdated++;
                    if (result.errors && result.errors.length > 0) totalErrors++;

                } catch (e) {
                    console.error(`Error processing rankcheck for ${discordId}:`, e);
                    totalErrors++;
                }

                // Small delay to avoid rate limits
                await new Promise(resolve => setTimeout(resolve, 200));
            }

            embed.setTitle(`✅ ${selectedRank ? `${selectedRank} ` : ''}Rank Sync Complete`)
                .setDescription(`Processed **${processedCount}** relevant members.\n✅ Updated: ${totalUpdated}\n❌ Errors: ${totalErrors}`)
                .setColor(totalErrors > 0 ? 0xFFA500 : 0x00FF00); 

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

                const result = await syncMember(member, userData);

                if (result.status === 'error') {
                    return interaction.editReply({ content: `❌ Error: ${result.error}` });
                }

                const embed = new EmbedBuilder()
                    .setTitle(`Rank Sync: ${targetUser.username}`)
                    .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                    .setColor(0x00FF00);

                embed.addFields({
                    name: '🎮 In-Game Rank',
                    value: userData.rank || 'None/Unknown',
                    inline: false
                });

                const added = result.changes.filter(c => c.startsWith('Added')).map(c => c.replace('Added: ', ''));
                const removed = result.changes.filter(c => c.startsWith('Removed')).map(c => c.replace('Removed: ', ''));

                const resolveName = (id) => {
                    const r = rankLinks.find(link => link.role_id === id);
                    return r ? r.name : `<@&${id}>`;
                };

                if (added.length > 0) {
                    embed.addFields({ name: '✅ Roles Added', value: added.map(resolveName).join('\n') || 'None' });
                }

                if (removed.length > 0) {
                    embed.addFields({ name: '🗑️ Roles Removed', value: removed.map(resolveName).join('\n') || 'None' });
                }

                if (added.length === 0 && removed.length === 0 && (!result.errors || result.errors.length === 0)) {
                    embed.setDescription('✅ User rank roles are already in sync.');
                }

                if (result.errors && result.errors.length > 0) {
                    embed.addFields({
                        name: '❌ Errors Encountered',
                        value: result.errors.map(e => `• ${e}`).join('\n').slice(0, 1024)
                    });
                    embed.setColor(0xFF0000); 
                }

                await interaction.editReply({ embeds: [embed] });

            } catch (error) {
                console.error('Error in rankcheck single user command:', error);
                let errorMessage = '❌ An error occurred while checking rank roles.';

                if (error.response) {
                    if (error.response.status === 404) {
                        errorMessage = '❌ User profile not found in API.';
                    } else {
                        errorMessage = `❌ API Error: ${error.response.status}`;
                    }
                }

                await interaction.editReply({ content: errorMessage });
            }
        }
    }
};
