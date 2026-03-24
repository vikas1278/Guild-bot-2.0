const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const axios = require('axios');
require('dotenv').config();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('guildinfo')
        .setDescription('Displays detailed information about a guild'),

    async execute(interaction) {
        await interaction.deferReply();

        const apiUrl = process.env.GUILD_API_ENDPOINT;
        const bearerToken = process.env.BEARER_TOKEN;

        if (!apiUrl || !bearerToken) {
            return interaction.editReply('❌ Error: Missing API configuration. Please check your environment variables.');
        }

        try {
            // Fetch the list of guilds
            const response = await axios.get(apiUrl, {
                headers: {
                    'Authorization': `Bearer ${bearerToken}`,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            });

            let guilds = [];
            const responseData = response.data;
            if (responseData && responseData.items && Array.isArray(responseData.items)) {
                guilds = responseData.items;
            } else if (Array.isArray(responseData)) {
                guilds = responseData;
            } else if (responseData && responseData.data) {
                guilds = responseData.data;
            } else if (responseData && responseData.guilds) {
                guilds = responseData.guilds;
            }

            if (!guilds || guilds.length === 0) {
                return interaction.editReply('❌ No guilds found in the database.');
            }

            // Create a select menu for guild selection
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('guildinfo_select')
                .setPlaceholder('Select a guild to view info')
                .addOptions(
                    guilds.map((guild, index) => {
                        const name = guild.guild_name || guild.name || `Guild ${guild.ffmax_guild_id || guild.id || index + 1}`;
                        const id = guild.ffmax_guild_id || guild.id;
                        return {
                            label: name.substring(0, 100),
                            description: `ID: ${id}`,
                            value: id.toString()
                        };
                    }).slice(0, 25)
                );

            const row = new ActionRowBuilder().addComponents(selectMenu);

            const embed = new EmbedBuilder()
                .setTitle('🏰 Select a Guild')
                .setDescription('Please choose a guild from the dropdown menu below to view its details.')
                .setColor(0x2B2D31)
                .setTimestamp();

            const message = await interaction.editReply({
                embeds: [embed],
                components: [row]
            });

            // Component Collector for Selection
            const collector = message.createMessageComponentCollector({
                componentType: ComponentType.StringSelect,
                time: 300000 // 5 minutes
            });

            collector.on('collect', async (i) => {
                if (i.user.id !== interaction.user.id) {
                    return i.reply({ content: '❌ This is not your interaction.', flags: MessageFlags.Ephemeral });
                }

                const selectedGuildId = i.values[0];
                const selectedGuild = guilds.find(g => (g.ffmax_guild_id || g.id).toString() === selectedGuildId);

                await i.deferUpdate();

                if (!selectedGuild) {
                    return interaction.editReply({ content: '❌ Guild not found.', components: [] });
                }

                await this.showGuildInfo(interaction, selectedGuild, bearerToken);
            });

            collector.on('end', async (collected, reason) => {
                if (reason === 'time' && collected.size === 0) {
                    await interaction.editReply({ content: '❌ Interaction timed out.', embeds: [], components: [] });
                }
            });

        } catch (error) {
            console.error('[guildinfo] Error:', error);
            await interaction.editReply('❌ Failed to fetch guilds. Please try again later.');
        }
    },

    async showGuildInfo(interaction, shortGuild, bearerToken) {
        const guildId = shortGuild.ffmax_guild_id || shortGuild.id;
        
        try {
            // 1. Fetch full guild info to get rules, requirements, and logo
            const baseUrl = process.env.GUILD_API_ENDPOINT?.split('?')[0];
            let guild = shortGuild;
            
            if (baseUrl) {
                try {
                    const infoResponse = await axios.get(baseUrl, {
                        params: { action: 'guild_info', guild_id: guildId },
                        headers: {
                            'Authorization': `Bearer ${bearerToken}`,
                            'Accept': 'application/json'
                        },
                        timeout: 10000
                    });

                    const items = infoResponse.data?.items || infoResponse.data?.data || infoResponse.data || [];
                    const foundGuild = (Array.isArray(items) ? items : []).find(g => String(g.ffmax_guild_id || g.guild_id || g.id) === String(guildId));
                    if (foundGuild) guild = foundGuild;
                } catch (e) {
                    console.error('Failed to fetch full guild info:', e.message);
                }
            }

            const guildName = guild.guild_name || guild.name || `Guild ${guildId}`;
            const maxMembers = guild.member_limit || guild.max_member_count || guild.max_members || 55;
            const currentMembers = guild.member_count || 0;
            const guildLogo = guild.icon || guild.image_url || guild.image || guild.logo || null;
            
            // Helper to format rules or requirements if they are arrays of objects
            const formatRules = (data) => {
                if (Array.isArray(data)) {
                    return data.map((item, index) => {
                        const text = typeof item === 'object' ? (item.text || item.description || item.rule || JSON.stringify(item)) : item;
                        return `${index + 1}. ${text}`;
                    }).join('\n');
                }
                return data;
            };

            const rulesContent = formatRules(guild.rules || guild.guild_rules) || 'No rules set for this guild.';
            const reqsContent = formatRules(guild.requirements || guild.guild_requirements) || 'No specific requirements set for this guild.';

            // 2. Fetch members to identify Leader, AGL, and Officers
            const memberListApi = process.env.listguilds_endpoint || `${process.env.GUILD_API_ENDPOINT}?action=list_members`;
            let memberApiUrl = memberListApi;
            if (memberApiUrl.includes('limit=')) {
                memberApiUrl = memberApiUrl.replace(/limit=\d+/, 'limit=10000');
            } else {
                memberApiUrl += (memberApiUrl.includes('?') ? '&' : '?') + 'limit=10000';
            }

            let members = [];
            try {
                const memberResponse = await axios.get(memberApiUrl, {
                    params: { guild_id: guildId },
                    headers: {
                        'Authorization': `Bearer ${bearerToken}`,
                        'Accept': 'application/json'
                    },
                    timeout: 10000
                });

                if (memberResponse.data && Array.isArray(memberResponse.data.data)) {
                    members = memberResponse.data.data;
                } else if (Array.isArray(memberResponse.data)) {
                    members = memberResponse.data;
                } else if (memberResponse.data && Array.isArray(memberResponse.data.items)) {
                    members = memberResponse.data.items;
                }
            } catch (e) {
                console.error('Failed to fetch guild members:', e.message);
            }

            // Filter members for this guild
            const guildMembers = members.filter(m => String(m.guild_ffmax_id || m.guild_id || m.id) === String(guildId));

            const leader = guildMembers.find(m => ['leader'].includes((m.rank || m.role || '').toLowerCase()));
            const agls = guildMembers.filter(m => ['acting guild leader', 'agl'].includes((m.rank || m.role || '').toLowerCase()));
            const officers = guildMembers.filter(m => ['officer'].includes((m.rank || m.role || '').toLowerCase()));

            // Helper to format member with mention if discord_id exists
            const formatMember = (m) => {
                const id = m.discord_id || m.discordId;
                const ign = m.ign || m.username || 'Unknown';
                return id ? `<@${id}> (${ign})` : ign;
            };

            // Progress Bar (18 units to match example "████████░░░░░░░░░░")
            const totalSegments = 18;
            const percentage = Math.min(Math.round((currentMembers / maxMembers) * 100), 100);
            const filledCount = Math.min(Math.round((percentage / 100) * totalSegments), totalSegments);
            const emptyCount = totalSegments - filledCount;
            const progressBar = '█'.repeat(filledCount) + '░'.repeat(emptyCount);

            const embed = new EmbedBuilder()
                .setTitle(`🏰 ${guildName}`)
                .setColor(0x2B2D31)
                .setThumbnail(guildLogo)
                .setDescription('━━━━━━━━━━━━━━━━━━━━')
                .addFields(
                    { 
                        name: '📊 Guild Status', 
                        value: `Members: ${currentMembers} / ${maxMembers}\n${progressBar} ${percentage}%`,
                        inline: false 
                    },
                    { 
                        name: '👑 Leadership', 
                        value: leader ? `• ${formatMember(leader)}` : 'None',
                        inline: false 
                    },
                    { 
                        name: '✨ Acting Guild Leader', 
                        value: agls.length > 0 ? agls.map(a => `• ${formatMember(a)}`).join('\n') : 'None',
                        inline: false 
                    },
                    { 
                        name: '🛡 Officers', 
                        value: officers.length > 0 ? officers.map(o => `• ${formatMember(o)}`).join('\n') : 'None',
                        inline: false 
                    },
                    { 
                        name: '🆔 Guild ID', 
                        value: `\`${guildId}\``, 
                        inline: false 
                    }
                )
                .setFooter({ 
                    text: `Requested by ${interaction.user.username}`, 
                    iconURL: interaction.user.displayAvatarURL() 
                })
                .setTimestamp();

            const buttons = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`rules_${guildId}`)
                    .setLabel('Guild Rules')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId(`reqs_${guildId}`)
                    .setLabel('Guild Requirements')
                    .setStyle(ButtonStyle.Primary)
            );

            const message = await interaction.editReply({
                content: null,
                embeds: [embed],
                components: [buttons]
            });

            // Button collector
            const collector = message.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 300000 // 5 minutes
            });

            collector.on('collect', async (i) => {
                if (i.customId.startsWith('rules_')) {
                    const rulesEmbed = new EmbedBuilder()
                        .setTitle('📜 Guild Rules')
                        .setDescription(rulesContent)
                        .setColor(0xFF0000)
                        .setTimestamp();
                    
                    await i.reply({ embeds: [rulesEmbed], flags: MessageFlags.Ephemeral });
                    
                    // Auto delete after 5 minutes
                    setTimeout(() => {
                        i.deleteReply().catch(() => {});
                    }, 300000);

                } else if (i.customId.startsWith('reqs_')) {
                    const reqsEmbed = new EmbedBuilder()
                        .setTitle('🏆 Guild Requirements')
                        .setDescription(reqsContent)
                        .setColor(0x5865F2)
                        .setTimestamp();
                    
                    await i.reply({ embeds: [reqsEmbed], flags: MessageFlags.Ephemeral });

                    // Auto delete after 5 minutes
                    setTimeout(() => {
                        i.deleteReply().catch(() => {});
                    }, 300000);
                }
            });

            collector.on('end', async () => {
                // Disable buttons after timeout
                const disabledButtons = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('rules_disabled')
                        .setLabel('Guild Rules')
                        .setStyle(ButtonStyle.Danger)
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId('reqs_disabled')
                        .setLabel('Guild Requirements')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(true)
                );

                await interaction.editReply({ components: [disabledButtons] }).catch(() => {});
            });

        } catch (error) {
            console.error('[guildinfo] Error in showGuildInfo:', error);
            await interaction.followUp({ content: '❌ Failed to fetch detailed guild data. Please try again later.', flags: MessageFlags.Ephemeral });
        }
    }
};
