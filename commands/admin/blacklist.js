const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');

const RANK_LINKS_PATH = path.join(__dirname, '../../rank_links.json');
const COMMANDER_DB_PATH = path.join(__dirname, '../../commanderdb.json');

async function getRankLinks() {
    try {
        const data = await fs.readFile(RANK_LINKS_PATH, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        return [];
    }
}

async function saveRankLinks(links) {
    try {
        const dir = path.dirname(RANK_LINKS_PATH);
        await fs.mkdir(dir, { recursive: true });

        const jsonString = JSON.stringify(links, null, 2);
        await fs.writeFile(RANK_LINKS_PATH, jsonString, 'utf-8');
        return true;
    } catch (error) {
        console.error('[blacklist] Error saving rank links:', error);
        throw new Error('Failed to save rank links to file');
    }
}

async function isBotCommander(userId) {
    try {
        const data = await fs.readFile(COMMANDER_DB_PATH, 'utf-8');
        const { commanders } = JSON.parse(data);
        const owners = (process.env.BOT_OWNER || '').split(',').map(id => id.trim()).filter(Boolean);
        return commanders.includes(userId) || owners.includes(userId);
    } catch (error) {
        // Fallback to owner check if file missing
        const owners = (process.env.BOT_OWNER || '').split(',').map(id => id.trim()).filter(Boolean);
        return owners.includes(userId);
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('blacklist')
        .setDescription('Manage blacklisted roles for rank links (Bot Owner/Commander Only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommandGroup(group =>
            group.setName('role')
                .setDescription('Manage blacklisted roles')
                .addSubcommand(subcommand =>
                    subcommand.setName('add')
                        .setDescription('Add a role to the blacklist')
                        .addRoleOption(option =>
                            option.setName('role')
                                .setDescription('The Discord role to blacklist')
                                .setRequired(true)))
                .addSubcommand(subcommand =>
                    subcommand.setName('delete')
                        .setDescription('Remove a role from the blacklist')
                        .addRoleOption(option =>
                            option.setName('role')
                                .setDescription('The Discord role to remove from blacklist')
                                .setRequired(true)))
                .addSubcommand(subcommand =>
                    subcommand.setName('check')
                        .setDescription('Check all banned members from API and assign blacklist roles'))),

    async execute(interaction) {
        await interaction.deferReply();

        const isCommander = await isBotCommander(interaction.user.id);
        if (!isCommander) {
            return interaction.editReply({
                content: '❌ This command can only be used by bot owners or commanders.'
            });
        }

        const subcommand = interaction.options.getSubcommand();

        try {
            let rankLinks = await getRankLinks();

            if (subcommand === 'add') {
                const role = interaction.options.getRole('role');
                const alreadyExists = rankLinks.some(r => r.rank_name === 'blacklist' && r.role_id === role.id);
                
                if (alreadyExists) {
                    return interaction.editReply({
                        content: `⚠️ The role **@${role.name}** is already in the blacklist.`
                    });
                }

                rankLinks.push({
                    rank_name: "blacklist",
                    role_id: role.id,
                    name: role.name
                });

                await saveRankLinks(rankLinks);
                await interaction.editReply({
                    content: `✅ Successfully added **@${role.name}** to the blacklist!`
                });

            } else if (subcommand === 'delete') {
                const role = interaction.options.getRole('role');
                const initialLength = rankLinks.length;
                rankLinks = rankLinks.filter(r => !(r.rank_name === 'blacklist' && r.role_id === role.id));

                if (rankLinks.length === initialLength) {
                    return interaction.editReply({
                        content: `ℹ️ The role **@${role.name}** was not found in the blacklist.`
                    });
                }

                await saveRankLinks(rankLinks);
                await interaction.editReply({
                    content: `✅ Successfully removed **@${role.name}** from the blacklist.`
                });

            } else if (subcommand === 'check') {
                const blacklistRoles = rankLinks.filter(r => r.rank_name === 'blacklist').map(r => r.role_id);
                
                if (blacklistRoles.length === 0) {
                    return interaction.editReply({
                        content: '❌ No blacklisted roles found in `/blacklist role add`. Please add one first.'
                    });
                }

                const apiUrl = process.env.banlistapi_endpoint;
                if (!apiUrl) {
                    return interaction.editReply({
                        content: '❌ Error: `banlistapi_endpoint` is not defined in the `.env` file.'
                    });
                }

                // Fetch banned members
                const response = await axios.get(apiUrl, {
                    headers: {
                        'Authorization': `Bearer ${process.env.BEARER_TOKEN}`,
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    },
                    timeout: 15000
                });

                const responseData = response.data;
                let bannedMembers = [];

                if (responseData && responseData.data && responseData.data.rows && Array.isArray(responseData.data.rows)) {
                    bannedMembers = responseData.data.rows;
                } else if (Array.isArray(responseData)) {
                    bannedMembers = responseData;
                } else if (responseData && responseData.items && Array.isArray(responseData.items)) {
                    bannedMembers = responseData.items;
                }

                const bannedIds = new Set(bannedMembers.map(m => m.discord_id || m.discordId).filter(id => id && id !== 'N/A'));

                let updatedCount = 0;
                let removedCount = 0;
                let alreadyHadRolesCount = 0;
                let memberNotFoundCount = 0;
                let errorCount = 0;

                // 1. Add roles to those who are banned
                for (const memberInfo of bannedMembers) {
                    const discordId = memberInfo.discord_id || memberInfo.discordId;
                    if (!discordId || discordId === 'N/A') {
                        memberNotFoundCount++;
                        continue;
                    }

                    try {
                        const member = await interaction.guild.members.fetch(discordId).catch(() => null);
                        if (!member) {
                            memberNotFoundCount++;
                            continue;
                        }

                        let needsUpdate = false;
                        for (const roleId of blacklistRoles) {
                            if (!member.roles.cache.has(roleId)) {
                                needsUpdate = true;
                                break;
                            }
                        }

                        if (needsUpdate) {
                            await member.roles.add(blacklistRoles, 'Blacklisted via /blacklist role check');
                            updatedCount++;
                        } else {
                            alreadyHadRolesCount++;
                        }

                    } catch (err) {
                        console.error(`Error processing member ${discordId}:`, err);
                        errorCount++;
                    }
                }

                // 2. Remove roles from those who are NOT banned but have the roles
                for (const roleId of blacklistRoles) {
                    try {
                        const role = await interaction.guild.roles.fetch(roleId).catch(() => null);
                        if (!role) continue;

                        // Force fetch members with this role to be accurate
                        await interaction.guild.members.fetch(); 
                        
                        for (const [memberId, member] of role.members) {
                            if (!bannedIds.has(memberId)) {
                                try {
                                    await member.roles.remove(roleId, 'Unblacklisted via /blacklist role check');
                                    removedCount++;
                                } catch (err) {
                                    console.error(`Error removing role from ${memberId}:`, err);
                                    errorCount++;
                                }
                            }
                        }
                    } catch (err) {
                        console.error(`Error fetching role ${roleId}:`, err);
                        errorCount++;
                    }
                }

                const summaryEmbed = new EmbedBuilder()
                    .setTitle('🛠️ Blacklist Sync Complete')
                    .setColor('#FF0000')
                    .setDescription(`Processed **${bannedMembers.length}** entries from the API.`)
                    .addFields(
                        { name: '✅ Roles Added', value: `${updatedCount}`, inline: true },
                        { name: '🗑️ Roles Removed', value: `${removedCount}`, inline: true },
                        { name: 'ℹ️ Already Correct', value: `${alreadyHadRolesCount}`, inline: true },
                        { name: '👤 Not in Server', value: `${memberNotFoundCount}`, inline: true },
                        { name: '❌ Errors', value: `${errorCount}`, inline: true }
                    )
                    .setFooter({ text: `Synced via ${interaction.user.tag}` })
                    .setTimestamp();

                await interaction.editReply({ embeds: [summaryEmbed] });
            }

        } catch (error) {
            console.error('Error in blacklist command:', error);
            await interaction.editReply({
                content: '❌ An error occurred while processing the blacklist command.'
            });
        }
    }
};
