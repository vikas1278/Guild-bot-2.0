const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType } = require('discord.js');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const ROLE_LINKS_PATH = path.join(__dirname, '../../role_links.json');
const RANK_LINKS_PATH = path.join(__dirname, '../../rank_links.json');
const SYNC_STATE_PATH = path.join(__dirname, '../../autorolesync.json');

let syncIntervalId = null;

async function getJsonData(filePath) {
    try {
        const data = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        return {};
    }
}

async function saveJsonData(filePath, data) {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

async function isBotCommander(userId) {
    try {
        const data = await fs.readFile(path.join(__dirname, '../../commanderdb.json'), 'utf-8');
        const { commanders } = JSON.parse(data);
        return commanders.includes(userId) || userId === process.env.BOT_OWNER;
    } catch (error) {
        return userId === process.env.BOT_OWNER;
    }
}

function parseInterval(intervalStr) {
    const value = parseInt(intervalStr);
    if (isNaN(value)) return null;
    const unit = intervalStr.slice(-1).toLowerCase();
    switch (unit) {
        case 's': return value * 1000;
        case 'm': return value * 60 * 1000;
        case 'h': return value * 60 * 60 * 1000;
        case 'd': return value * 24 * 60 * 60 * 1000;
        default: return null;
    }
}

/**
 * Core sync logic that can be called by interaction or scheduler
 */
async function performSync(client, guildId, logChannelId = null) {
    const roleLinks = await getJsonData(ROLE_LINKS_PATH);
    const rankLinks = await getJsonData(RANK_LINKS_PATH);
    const syncState = await getJsonData(SYNC_STATE_PATH);

    const lastSyncTime = new Date(syncState.last_sync_time || "2000-01-01T00:00:00Z");
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return { error: `Guild ${guildId} not found in cache.` };

    try {
        const response = await axios.get(process.env.autosync_endpoint, {
            headers: {
                'Authorization': `Bearer ${process.env.BEARER_TOKEN}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            timeout: 30000
        });

        let apiMembers = response.data.data || response.data.items || response.data || [];
        const updatedMembers = apiMembers.filter(m => new Date(m.updated_at || m.updated || 0) > lastSyncTime);

        console.log(`[AutoRoleSync] Fetched ${apiMembers.length} members. New updates: ${updatedMembers.length}`);

        let totalUpdated = 0;
        let totalErrors = 0;
        let latestSeenUpdate = lastSyncTime;
        const memberLogs = []; // per-member detail tracking

        if (updatedMembers.length > 0) {
            for (const apiMem of updatedMembers) {
                const discordId = apiMem.discord_id || apiMem.discordId;
                if (!discordId) continue;

                const memberUpdated = new Date(apiMem.updated_at || apiMem.updated || 0);
                if (memberUpdated > latestSeenUpdate) latestSeenUpdate = memberUpdated;

                const ign = apiMem.ign || apiMem.username || apiMem.name || 'Unknown';
                const rolesAdded = [];
                const rolesRemoved = [];
                let memberErrors = 0;

                try {
                    const member = await guild.members.fetch(discordId).catch(() => null);
                    if (!member) {
                        memberLogs.push({ ign, discordId, rolesAdded, rolesRemoved, notFound: true });
                        continue;
                    }

                    // Helper to resolve role name
                    const resolveRoleName = (roleId) => {
                        const r = guild.roles.cache.get(roleId);
                        return r ? r.name : `<@&${roleId}>`;
                    };

                    // --- Role Sync Logic ---
                    const userGuildId = apiMem.guild_ffmax_id || apiMem.ffmax_guild_id || apiMem.guild_id;
                    const targetGuildEntry = roleLinks.find(g => String(g.guildId || g.ffmax_guild_id) === String(userGuildId));
                    const shouldHaveRoleIds = new Set(targetGuildEntry?.roles.map(r => r.role_id) || []);
                    const allManagedRoleIds = new Set();
                    roleLinks.forEach(g => g.roles.forEach(role => allManagedRoleIds.add(role.role_id)));

                    for (const roleId of allManagedRoleIds) {
                        const has = member.roles.cache.has(roleId);
                        const should = shouldHaveRoleIds.has(roleId);
                        if (should && !has) {
                            const ok = await member.roles.add(roleId).then(() => true).catch(() => false);
                            if (ok) rolesAdded.push(resolveRoleName(roleId));
                            else { memberErrors++; totalErrors++; }
                        } else if (!should && has) {
                            const ok = await member.roles.remove(roleId).then(() => true).catch(() => false);
                            if (ok) rolesRemoved.push(resolveRoleName(roleId));
                            else { memberErrors++; totalErrors++; }
                        }
                    }

                    // --- Rank Sync Logic ---
                    const userRank = (apiMem.rank || apiMem.ign_rank || '').trim();
                    const expectedRankLink = rankLinks.find(link =>
                        link.rank_name.toLowerCase() === userRank.toLowerCase()
                    );
                    const expectedRankRoleId = expectedRankLink ? expectedRankLink.role_id : null;
                    const allManagedRankRoles = new Set(rankLinks.map(l => l.role_id));

                    for (const roleId of allManagedRankRoles) {
                        const has = member.roles.cache.has(roleId);
                        const should = (roleId === expectedRankRoleId);
                        if (should && !has) {
                            const ok = await member.roles.add(roleId).then(() => true).catch(() => false);
                            if (ok) rolesAdded.push(`${resolveRoleName(roleId)} *(rank)*`);
                            else { memberErrors++; totalErrors++; }
                        } else if (!should && has) {
                            const ok = await member.roles.remove(roleId).then(() => true).catch(() => false);
                            if (ok) rolesRemoved.push(`${resolveRoleName(roleId)} *(rank)*`);
                            else { memberErrors++; totalErrors++; }
                        }
                    }

                    const changed = rolesAdded.length > 0 || rolesRemoved.length > 0;
                    if (changed) totalUpdated++;
                    memberLogs.push({ ign, discordId, rolesAdded, rolesRemoved, errors: memberErrors });

                } catch (e) { totalErrors++; memberLogs.push({ ign, discordId, rolesAdded, rolesRemoved, errors: 1 }); }
                await new Promise(r => setTimeout(r, 200));
            }

            syncState.last_sync_time = latestSeenUpdate.toISOString();
            syncState.last_run = new Date().toISOString();
            await saveJsonData(SYNC_STATE_PATH, syncState);
        } else {
            syncState.last_run = new Date().toISOString();
            await saveJsonData(SYNC_STATE_PATH, syncState);
        }

        if (logChannelId && updatedMembers.length > 0) {
            const logChannel = await client.channels.fetch(logChannelId).catch(() => null);
            if (logChannel) {
                const logEmbed = new EmbedBuilder()
                    .setTitle('🕒 Automated Role Sync Log')
                    .setDescription(`Sync completed for **${updatedMembers.length}** member(s).`)
                    .addFields(
                        { name: '👥 Members Processed', value: `${updatedMembers.length}`, inline: true },
                        { name: '✅ Updated', value: `${totalUpdated}`, inline: true },
                        { name: '❌ Errors', value: `${totalErrors}`, inline: true }
                    )
                    .setColor(totalErrors > 0 ? 0xFFA500 : totalUpdated > 0 ? 0x00FF00 : 0x5865F2)
                    .setTimestamp();

                // Add per-member detail fields
                for (const log of memberLogs) {
                    if (log.notFound) {
                        logEmbed.addFields({
                            name: `👤 ${log.ign}`,
                            value: `<@${log.discordId}> — ⚠️ Not found in server`,
                            inline: false
                        });
                        continue;
                    }
                    if (log.rolesAdded.length === 0 && log.rolesRemoved.length === 0 && !log.errors) continue;

                    const lines = [];
                    if (log.rolesAdded.length > 0) lines.push(`**Added:** ${log.rolesAdded.join(', ')}`);
                    if (log.rolesRemoved.length > 0) lines.push(`**Removed:** ${log.rolesRemoved.join(', ')}`);
                    if (log.errors) lines.push(`⚠️ ${log.errors} error(s)`);

                    logEmbed.addFields({
                        name: `👤 ${log.ign} (<@${log.discordId}>)`,
                        value: lines.join('\n') || 'No changes',
                        inline: false
                    });
                }

                await logChannel.send({ embeds: [logEmbed] }).catch(err => console.error('Failed to send log:', err));
            } else {
                console.log(`[AutoRoleSync] Could not find log channel ${logChannelId}`);
            }
        }

        return { count: updatedMembers.length, updated: totalUpdated, errors: totalErrors };
    } catch (error) {
        console.error('[AutoRoleSync Core Error]:', error.message);
        return { error: error.message };
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('autorolesync')
        .setDescription('Manage automated role and rank synchronization')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub => sub.setName('run').setDescription('Manually trigger an immediate update sync'))
        .addSubcommand(sub => sub.setName('status').setDescription('Check the current automation status'))
        .addSubcommand(sub => sub.setName('stop').setDescription('Disable the automated background sync'))
        .addSubcommand(sub => sub.setName('set-channel').setDescription('Set the channel for sync logs')
            .addChannelOption(opt => opt.setName('channel').setDescription('The channel to send logs to').setRequired(true).addChannelTypes(ChannelType.GuildText)))
        .addSubcommand(sub => sub.setName('start').setDescription('Enable automated sync with a custom interval')
            .addStringOption(opt => opt.setName('interval').setDescription('Interval (e.g. 30m, 1h, 1d)').setRequired(true))),

    async execute(interaction) {
        await interaction.deferReply();

        if (!(await isBotCommander(interaction.user.id))) {
            return interaction.editReply('❌ This command can only be used by bot owners or commanders.');
        }

        const subcommand = interaction.options.getSubcommand();
        const state = await getJsonData(SYNC_STATE_PATH);

        if (subcommand === 'run') {
            const res = await performSync(interaction.client, interaction.guildId);
            if (res.error) return interaction.editReply(`❌ Error: ${res.error}`);
            if (res.count === 0) return interaction.editReply('ℹ️ No new updates found in the API.');
            return interaction.editReply(`✅ Sync complete. Processed ${res.count} members. Updated ${res.updated} users. Errors: ${res.errors}`);
        }

        if (subcommand === 'set-channel') {
            const channel = interaction.options.getChannel('channel');
            state.log_channel_id = channel.id;
            state.guild_id = interaction.guildId;
            await saveJsonData(SYNC_STATE_PATH, state);
            return interaction.editReply(`✅ Log channel set to ${channel}.`);
        }

        if (subcommand === 'start') {
            const intervalStr = interaction.options.getString('interval');
            const ms = parseInterval(intervalStr);
            if (!ms || ms < 60000) return interaction.editReply('❌ Invalid interval. Minimum is 1m.');

            state.auto_sync_enabled = true;
            state.interval = intervalStr;
            state.guild_id = interaction.guildId;
            await saveJsonData(SYNC_STATE_PATH, state);

            this.init(interaction.client);
            return interaction.editReply(`✅ Automated sync started every \`${intervalStr}\`.`);
        }

        if (subcommand === 'stop') {
            state.auto_sync_enabled = false;
            await saveJsonData(SYNC_STATE_PATH, state);
            if (syncIntervalId) { clearInterval(syncIntervalId); syncIntervalId = null; }
            return interaction.editReply('✅ Automated sync has been disabled.');
        }

        if (subcommand === 'status') {
            const embed = new EmbedBuilder()
                .setTitle('📊 AutoRoleSync Status')
                .setColor(state.auto_sync_enabled ? 0x00FF00 : 0xFF0000)
                .addFields(
                    { name: 'Enabled', value: state.auto_sync_enabled ? '✅ Yes' : '❌ No', inline: true },
                    { name: 'Interval', value: `\`${state.interval || 'N/A'}\``, inline: true },
                    { name: 'Log Channel', value: state.log_channel_id ? `<#${state.log_channel_id}>` : 'None', inline: true },
                    { name: 'Last Sync', value: `\`${state.last_sync_time || 'Never'}\`` },
                    { name: 'Last Run', value: `\`${state.last_run || 'Never'}\`` }
                );
            return interaction.editReply({ embeds: [embed] });
        }
    },

    init(client) {
        if (syncIntervalId) clearInterval(syncIntervalId);

        getJsonData(SYNC_STATE_PATH).then(state => {
            if (!state.auto_sync_enabled || !state.guild_id) return;
            const ms = parseInterval(state.interval || '1h');
            if (!ms) return;

            console.log(`[AutoRoleSync] Scheduling sync every ${state.interval} (${ms}ms)`);
            syncIntervalId = setInterval(() => {
                performSync(client, state.guild_id, state.log_channel_id).catch(err => console.error('[AutoRoleSync Error]', err));
            }, ms);
        });
    }
};
