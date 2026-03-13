const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const axios = require('axios');
require('dotenv').config();

// Helper function to format date
const formatDate = (dateString) => {
    if (!dateString) return 'Not Available';
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        });
    } catch (e) {
        return dateString;
    }
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('profile')
        .setDescription('View profile information')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('View a Discord user\'s profile')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('uid')
                .setDescription('View profile by game UID')
                .setRequired(false)),

    async execute(interaction) {
        await interaction.deferReply();

        try {
            const targetUser = interaction.options.getUser('user');
            const searchUid = interaction.options.getString('uid');

            // Determine which search method to use
            let apiUrl;
            let displayUser;

            if (searchUid) {
                // Search by UID
                apiUrl = `${process.env.PROFILE_API_ENDPOINT}${process.env.PROFILE_API_ENDPOINT.includes('?') ? '&' : '?'}uid=${searchUid}`;
                displayUser = null; // We don't have Discord user info when searching by UID
            } else if (targetUser) {
                // Search by Discord user
                apiUrl = `${process.env.PROFILE_API_ENDPOINT}${process.env.PROFILE_API_ENDPOINT.includes('?') ? '&' : '?'}discordId=${targetUser.id}`;
                displayUser = targetUser;
            } else {
                // Default to command user
                apiUrl = `${process.env.PROFILE_API_ENDPOINT}${process.env.PROFILE_API_ENDPOINT.includes('?') ? '&' : '?'}discordId=${interaction.user.id}`;
                displayUser = interaction.user;
            }

            // Fetch data from your API
            const response = await axios.get(apiUrl, {
                headers: {
                    'Authorization': `Bearer ${process.env.BEARER_TOKEN}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                timeout: 10000 // 10 second timeout
            });

            const userData = response.data.data || response.data;

            // Check if user is banned using the banStatus object
            const isBanned = userData.banStatus?.isBanned === true;
            const row = new ActionRowBuilder();

            // Add Blacklisted button only if user is banned
            if (isBanned) {
                const blacklistButton = new ButtonBuilder()
                    .setCustomId('show_ban_info')
                    .setLabel('Blacklisted')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('🔴');
                row.addComponents(blacklistButton);
            }

            // Log basic info for debugging (commented out for production)
            // Debug: Log the response
            console.log('Full API Response:', JSON.stringify(response.data, null, 2));
            console.log('userData object:', JSON.stringify(userData, null, 2));
            console.log('Mongo ID:', userData.mongo_id);
            console.log('Status value:', userData.status);
            console.log('Updated_at value:', userData.updated_at);

            console.log('User data loaded for:', userData.username || 'Unknown user');

            // If searching by UID and we have discord_id, try to get Discord user info
            if (searchUid && userData.discord_id) {
                try {
                    displayUser = await interaction.client.users.fetch(userData.discord_id);
                } catch (error) {
                    // console.log('Could not fetch Discord user:', error.message);
                    displayUser = null;
                }
            }

            // Safely create embed
            const embed = new EmbedBuilder()
                .setColor(userData.is_blacklisted ? '#ff0000' : '#5865F2') // Red if blacklisted, else blurple
                .setAuthor({
                    name: `${userData.username || (displayUser ? displayUser.username : (interaction.user.username))}s Free Fire Profile`.slice(0, 256)
                })
                .setDescription(`${userData.is_blacklisted ? '🔴' : '🟢'} | ${userData.rank || 'Member'} of ${userData.guild_name || 'No Guild'}`.slice(0, 4096))
                .setFooter({
                    text: `Free Fire Guild Profile • Requested by ${interaction.user.username}`.slice(0, 2048)
                });

            // Format avatar_url if it's a relative path
            if (userData.avatar_url && userData.avatar_url.startsWith('/')) {
                userData.avatar_url = `https://guildmanager.hawkeyeofficial.com${userData.avatar_url}`;
            }

            // Thumbnail Validation
            const isValidUrl = (urlStr) => {
                if (!urlStr || typeof urlStr !== 'string') return false;
                try {
                    new URL(urlStr);
                    return urlStr.startsWith('http://') || urlStr.startsWith('https://');
                } catch {
                    return false;
                }
            };

            if (isValidUrl(userData.avatar_url)) {
                embed.setThumbnail(userData.avatar_url);
            } else if (displayUser) {
                embed.setThumbnail(displayUser.displayAvatarURL({ dynamic: true, size: 256 }));
            }

            // Timestamp Validation
            const applySafeTimestamp = (dateStr) => {
                const parsed = new Date(dateStr);
                if (!isNaN(parsed.getTime())) {
                    embed.setTimestamp(parsed);
                    return true;
                }
                return false;
            };

            let timestampApplied = false;
            if (userData.join_date) timestampApplied = applySafeTimestamp(userData.join_date);
            if (!timestampApplied && userData.updated_at) timestampApplied = applySafeTimestamp(userData.updated_at);
            if (!timestampApplied && userData.updated) timestampApplied = applySafeTimestamp(userData.updated);
            if (!timestampApplied) embed.setTimestamp();

            // Game Information Section
            embed.addFields({
                name: '🎮 Free Fire Max Details',
                value: `IGN: \`${userData.ign || userData.username || 'Not Set'}\`\nUID: \`${userData.uid || 'Not Set'}\``,
                inline: false
            });

            // Guild Information Section
            embed.addFields({
                name: '🏠 FF Max Guild Information',
                value: `Guild: \`${userData.guild_name || 'Not Set'}\`\nGuild ID: \`${userData.ffmax_guild_id || 'Not Set'}\`\nRank: \`${userData.rank || 'Member'}\`\nJoined: \`${formatDate(userData.join_date)}\``,
                inline: false
            });

            // Discord ID Section
            embed.addFields({
                name: '🔗 Discord ID',
                value: `ID: \`${userData.discord_id || (displayUser ? displayUser.id : 'N/A')}\``,
                inline: false
            });

            // Add any additional fields from the API
            const excludedFields = [
                'id', 'ign', 'uid', 'rank', 'guild', 'status', 'updated',
                'lastSeen', 'createdAt', 'joinDate', 'description', 'avatar',
                'mongo_id', 'discord_id', 'join_date', 'updated_at', 'is_blacklisted',
                'banStatus', 'warnings', 'warnings_count', 'avatar_url', 'guild_ffmax_id'
            ];

            // Additional information section has been removed

            // Create a single row for both buttons
            const buttonRow = new ActionRowBuilder();
            const rows = [];

            // Add blacklist button if user is banned
            if (isBanned) {
                buttonRow.addComponents(
                    new ButtonBuilder()
                        .setCustomId('show_ban_info')
                        .setLabel('Blacklisted')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('🔴')
                );
            }

            // Add warning button if user has warnings
            if (userData.warnings && userData.warnings.length > 0) {
                buttonRow.addComponents(
                    new ButtonBuilder()
                        .setCustomId('show_warnings')
                        .setLabel(`Warnings (${userData.warnings_count || 0})`)
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('⚠️')
                );
            }

            // Only add the row if it has buttons
            if (buttonRow.components.length > 0) {
                rows.push(buttonRow);
            }

            const reply = await interaction.editReply({
                embeds: [embed],
                components: rows
            });

            // Set up collectors for both buttons if needed
            if (rows.length > 0) {
                const filter = i => (i.customId === 'show_ban_info' || i.customId === 'show_warnings') && i.user.id === interaction.user.id;
                const collector = reply.createMessageComponentCollector({ filter, time: 30000 });

                collector.on('collect', async i => {
                    if (i.customId === 'show_ban_info' && userData.banStatus?.isBanned) {
                        const banEmbed = new EmbedBuilder()
                            .setColor('#FF0000')
                            .setTitle('🚨 Ban Information')
                            .setThumbnail(userData.avatar_url || 'https://i.imgur.com/wSTFkRM.png')
                            .addFields(
                                { name: 'IGN', value: userData.ign || 'Not provided', inline: true },
                                { name: 'UID', value: userData.uid || 'Not provided', inline: true },
                                { name: 'Guild', value: userData.guild || 'Not provided', inline: true },
                                { name: 'Ban Reason', value: userData.banStatus?.reason || 'No reason provided' },
                                { name: 'Banned On', value: formatDate(userData.banStatus?.bannedAt) || 'Unknown' },
                                { name: 'Banned By', value: userData.banStatus?.bannedBy ? `<@${userData.banStatus.bannedBy}>` : 'Unknown' }
                            )
                            .setTimestamp()
                            .setFooter({ text: 'Ban Information' });

                        await i.reply({ embeds: [banEmbed], ephemeral: true });
                    } else if (i.customId === 'show_warnings' && userData.warnings?.length > 0) {
                        // Create warning details string
                        const warningDetails = userData.warnings
                            .filter(w => w.is_active !== false)
                            .map((warning, index) => {
                                const date = warning.at ? formatDate(warning.at) : 'Unknown date';
                                const warnedBy = warning.by ? `<@${warning.by}>` : 'Unknown';
                                return `${index + 1}- ${warning.message || 'No reason provided'}\n by: ${warnedBy} ${date}\n`;
                            })
                            .join('\n');

                        const warningEmbed = new EmbedBuilder()
                            .setColor('#FFA500')
                            .setTitle('⚠️ Warning Information')
                            .setThumbnail(userData.avatar_url || 'https://i.imgur.com/wSTFkRM.png')
                            .addFields(
                                { name: 'IGN', value: userData.ign || 'Not provided', inline: true },
                                { name: 'UID', value: userData.uid || 'Not provided', inline: true },
                                { name: 'Guild', value: userData.guild || 'Not provided', inline: true },
                                { name: 'Total Warnings', value: `${userData.warnings_count || 0}`, inline: true },
                                { name: 'Active Warnings', value: `${userData.warnings.filter(w => w.is_active !== false).length}`, inline: true },
                                { name: 'Warning Details', value: warningDetails, inline: false }
                            )
                            .setTimestamp()


                        await i.reply({ embeds: [warningEmbed], ephemeral: true });
                    }
                });

                collector.on('end', collected => {
                    const disabledRow = new ActionRowBuilder();

                    // Add disabled ban button if it exists
                    if (isBanned) {
                        disabledRow.addComponents(
                            new ButtonBuilder()
                                .setCustomId('show_ban_info')
                                .setLabel('Blacklisted')
                                .setStyle(ButtonStyle.Danger)
                                .setEmoji('🔴')
                                .setDisabled(true)
                        );
                    }

                    // Add disabled warning button if it exists
                    if (userData.warnings && userData.warnings.length > 0) {
                        disabledRow.addComponents(
                            new ButtonBuilder()
                                .setCustomId('show_warnings')
                                .setLabel(`Warnings (${userData.warnings_count || 0})`)
                                .setStyle(ButtonStyle.Primary)
                                .setEmoji('⚠️')
                                .setDisabled(true)
                        );
                    }

                    if (disabledRow.components.length > 0) {
                        reply.edit({ components: [disabledRow] }).catch(console.error);
                    }
                });
            }

        } catch (error) {
            console.error('Error in profile command:', error.message);

            let errorMessage = '❌ Failed to fetch profile data. Please try again later.';
            let errorEmbed = null;

            if (error.response) {
                errorMessage = `❌ API Error: ${error.response.status} - ${error.response.statusText}`;
                console.error('API Response:', error.response.data);

                // Check if user not found
                if (error.response.status === 404 || error.response.data?.message?.includes('not found')) {
                    errorMessage = null;
                    errorEmbed = new EmbedBuilder()
                        .setColor('#FF0000')
                        .setTitle('❌ User Not Found')
                        .setDescription('Please link your profile [🔗 Click Here](https://guildmanager.hawkeyeofficial.com/) to register.\n\n```fix\n🪧 You must be in Hawk Eye Guild\n```')
                        .setTimestamp();
                }
            } else if (error.request) {
                errorMessage = '❌ Could not connect to the server. Please try again later.';
            } else {
                errorMessage = `❌ Error: ${error.message}`;
            }

            const replyOptions = {};
            if (errorMessage) replyOptions.content = errorMessage;
            if (errorEmbed) replyOptions.embeds = [errorEmbed];

            await interaction.editReply(replyOptions);
        }
    },
};
