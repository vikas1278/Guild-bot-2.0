const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ComponentType, ButtonBuilder, ButtonStyle } = require('discord.js');
const axios = require('axios');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('memberlist')
        .setDescription('Show a list of all guild members'),

    async execute(interaction) {
        await interaction.deferReply({ flags: 0 }); // flags: 0 makes the response visible to everyone

        try {
            // First, fetch all guilds
            const apiUrl = process.env.GUILD_API_ENDPOINT;

            // Fetch guilds
            const guildsResponse = await axios.get(apiUrl, {
                headers: {
                    'Authorization': `Bearer ${process.env.BEARER_TOKEN}`,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            });

            // Process guilds data
            let guilds = [];
            const responseData = guildsResponse.data;

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
                return interaction.editReply('❌ No guilds found.');
            }

            // Create select menu with guilds
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('guild_select')
                .setPlaceholder('Select a guild to view members')
                .addOptions(
                    guilds.map((guild, index) => {
                        const guildName = guild.guild_name || guild.name || `Guild ${guild.ffmax_guild_id || guild.id || index + 1}`;
                        const guildId = guild.ffmax_guild_id || guild.id;
                        return {
                            label: guildName.length > 100 ? guildName.substring(0, 97) + '...' : guildName,
                            description: `ID: ${guildId}`,
                            value: guildId.toString()
                        };
                    })
                );

            const row = new ActionRowBuilder().addComponents(selectMenu);

            // Create embed for the selection menu
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('🏰 Select a Guild')
                .setDescription('Choose a guild from the dropdown below to view its members.')
                .setFooter({ text: `Total guilds: ${guilds.length}` })
                .setTimestamp();

            // Send the select menu with embed
            const response = await interaction.editReply({
                embeds: [embed],
                components: [row],
                flags: 0 // Make the message visible to everyone
            });

            // Handle the selection
            const collector = response.createMessageComponentCollector({
                componentType: ComponentType.StringSelect,
                time: 60000 // 1 minute to select
            });

            collector.on('collect', async (i) => {
                if (i.customId === 'guild_select') {
                    const selectedGuildId = i.values[0];
                    const selectedGuild = guilds.find(g => {
                        const gId = g.ffmax_guild_id || g.guild_id || g.id;
                        return gId === selectedGuildId || gId.toString() === selectedGuildId;
                    });

                    // Acknowledge the interaction first
                    await i.deferUpdate();

                    // Then update the message with loading state
                    await i.editReply({
                        content: `Loading members for the selected guild...`,
                        components: [], // Remove the select menu
                        embeds: [] // Clear any existing embeds
                    });

                    if (!selectedGuild) {
                        const errorEmbed = new EmbedBuilder()
                            .setColor('#ff0000')
                            .setTitle('❌ Error')
                            .setDescription('Guild not found. Please try again.');

                        return interaction.editReply({
                            embeds: [errorEmbed],
                            components: [row]
                        });
                    }

                    // Get guild name
                    const guildName = selectedGuild.guild_name || selectedGuild.guild || `Guild ${selectedGuildId}`;

                    try {
                        // Show loading state in the same message
                        await interaction.editReply({
                            content: ' ', // Empty content to clear any previous content
                            embeds: [new EmbedBuilder()
                                .setColor('#0099ff')
                                .setDescription(`Fetching members for **${guildName}**...`)
                            ],
                            components: []
                        });

                        // Now fetch and show members for the selected guild
                        await this.showGuildMembers(interaction, selectedGuildId, guildName, row);
                    } catch (error) {
                        console.error('Error in guild selection:', error);
                        const errorEmbed = new EmbedBuilder()
                            .setColor('#ff0000')
                            .setTitle('❌ Error')
                            .setDescription('An error occurred while processing your request.');

                        await interaction.editReply({
                            embeds: [errorEmbed],
                            components: []
                        });
                    }
                }
            });

            collector.on('end', collected => {
                if (collected.size === 0) {
                    interaction.followUp({ content: 'Guild selection timed out.', ephemeral: true });
                }
            });

        } catch (error) {
            console.error('Error in memberlist command:', error);
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Error')
                .setDescription('An error occurred while fetching guilds. Please try again later.');

            await interaction.editReply({
                embeds: [errorEmbed],
                flags: 0 // Make the error message visible to everyone
            });
        }
    },

    async showGuildMembers(interaction, guildId, guildName, row) {
        try {
            console.log(`Fetching members for guild: ${guildName} (${guildId})`);
            // Use the listguilds_endpoint from .env or fallback to the default endpoint
            let apiUrl = process.env.listguilds_endpoint ||
                `${process.env.GUILD_API_ENDPOINT}?action=list_members`;

            console.log(`Using API endpoint: ${apiUrl} for guild ID: ${guildId}`);

            // Override limit if present in URL
            if (apiUrl.includes('limit=')) {
                apiUrl = apiUrl.replace(/limit=\d+/, 'limit=10000');
            } else {
                apiUrl += (apiUrl.includes('?') ? '&' : '?') + 'limit=10000';
            }
            console.log(`Adjusted API URL: ${apiUrl}`);

            // Ensure we have a valid interaction
            if (!interaction || !interaction.editReply) {
                console.error('Invalid interaction object in showGuildMembers');
                return;
            }

            // The list_members endpoint likely filters by 'guild_id' parameter
            // We're passing the ID selected from the dropdown, which is now ffmax_guild_id
            const response = await axios.get(apiUrl, {
                params: {
                    guild_id: guildId
                },
                headers: {
                    'Authorization': `Bearer ${process.env.BEARER_TOKEN}`,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                timeout: 15000
            });

            const data = response.data;
            console.log('API Response:', JSON.stringify(data, null, 2));

            // Process the API response to extract member details
            let members = [];

            // Handle different possible response formats
            if (data && data.data && Array.isArray(data.data)) {
                members = data.data;
            } else if (data && data.members && Array.isArray(data.members)) {
                members = data.members;
            } else if (Array.isArray(data)) {
                members = data;
            } else if (data && data.items && Array.isArray(data.items)) {
                members = data.items;
            }

            // Map the members to a consistent format
            members = members.map(member => ({
                uid: member.uid || member.id || 'N/A',
                ign: member.ign || 'Unknown',
                // Using 'rank' directly as per user snippet
                role: member.rank || member.role || 'Member',
                is_blacklisted: member.is_blacklisted == "1" || member.is_blacklisted === true || (member.banStatus && member.banStatus.isBanned) || false,
                join_date: member.joinDate || member.created_at,
                // Ensure ID is captured correctly (discordId from snippet)
                discordId: member.discordId || member.user_id || 'N/A',
                // Include all original fields
                ...member
            }));

            console.log(`Found ${members.length} members for guild ${guildName}`);

            // Filter members by the selected guild ID
            // The API response might return all members if filtering isn't strict server-side
            const filteredMembers = members.filter(member => {
                const memberGuildId = member.guild_ffmax_id || member.guild_id || member.id;
                // Convert both to string for comparison to be safe
                return String(memberGuildId) === String(guildId);
            });

            console.log(`Filtered to ${filteredMembers.length} members for guild ID ${guildId}`);

            if (!filteredMembers || filteredMembers.length === 0) {
                const noMembersEmbed = new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle(`🏰 ${guildName} - No Members`)
                    .setDescription(`No members found in this guild.`);

                return interaction.editReply({
                    embeds: [noMembersEmbed],
                    components: [row]
                });
            }

            // Use filtered members for the rest of the logic
            members = filteredMembers;

            // Function to create embeds for the member list with pagination
            function createMemberListEmbeds(page = 0, itemsPerPage = 10) {
                // Sort members by rank priority: Leader > Acting Guild Leader > Officer > Member
                const sortedMembers = [...members].sort((a, b) => {
                    const rankOrder = {
                        'leader': 0,
                        'acting guild leader': 1,
                        'officer': 2,
                        'member': 3
                    };

                    const aRole = (a.role || a.rank || '').toLowerCase();
                    const bRole = (b.role || b.rank || '').toLowerCase();

                    const aOrder = rankOrder[aRole] || 3; // Default to member
                    const bOrder = rankOrder[bRole] || 3; // Default to member

                    if (aOrder === bOrder) {
                        // If same rank, sort by IGN
                        const aIGN = (a.ign || a.username || '').toLowerCase();
                        const bIGN = (b.ign || b.username || '').toLowerCase();
                        return aIGN.localeCompare(bIGN);
                    }

                    return aOrder - bOrder;
                });

                const start = page * itemsPerPage;
                const end = start + itemsPerPage;
                const currentMembers = sortedMembers.slice(start, end);

                const embed = new EmbedBuilder()
                    .setColor('#0099ff')
                    .setTitle(`**${guildName}**`)
                    .setDescription(`List of Guild Members (Total: ${members.length}):`)
                    .setTimestamp();

                let currentRank = null;
                let memberList = '';

                // Process members and group by role
                const membersByRole = {
                    'Leader': [],
                    'Acting Guild Leader': [],
                    'Officer': [],
                    'Member': []
                };

                for (const member of currentMembers) {
                    const role = (member.role || member.rank || 'member').toLowerCase();
                    const ign = member.ign || member.username || 'Unknown';
                    const id = member.discordId || member.user_id || 'N/A';

                    // Determine the role display name
                    if (role === 'leader') {
                        membersByRole['Leader'].push({ ign, id });
                    } else if (role === 'acting guild leader') {
                        membersByRole['Acting Guild Leader'].push({ ign, id });
                    } else if (role === 'officer') {
                        membersByRole['Officer'].push({ ign, id });
                    } else {
                        membersByRole['Member'].push({ ign, id });
                    }
                }

                // Add members to embed by role
                for (const [role, members] of Object.entries(membersByRole)) {
                    if (members.length === 0) continue;

                    let roleMembers = members.map(m => `${m.ign} - <@${m.id}>`).join('\n');

                    // Add role header and members in one field
                    embed.addFields({
                        name: `**${role}**`,
                        value: roleMembers,
                        inline: false
                    });
                }

                // Add footer with pagination info
                const totalPages = Math.ceil(members.length / itemsPerPage);
                embed.setFooter({
                    text: `Page ${page + 1} of ${totalPages} • Total Members: ${members.length} • ${new Date().toLocaleString()}`,
                    iconURL: interaction.client.user.displayAvatarURL()
                });

                return { embed, totalPages };
            }

            // Initialize pagination
            let currentPage = 0;
            const itemsPerPage = 20; // Adjust this number based on your needs

            // Function to create action row for pagination
            function createActionRow(hasNext, hasPrev) {
                return new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('prev_page')
                            .setLabel('⬅️ Previous')
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(!hasPrev),
                        new ButtonBuilder()
                            .setCustomId('next_page')
                            .setLabel('Next ➡️')
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(!hasNext)
                    );
            }

            // Send initial embed
            const { embed, totalPages } = createMemberListEmbeds(currentPage, itemsPerPage);
            const message = await interaction.editReply({
                content: ' ',
                embeds: [embed],
                components: totalPages > 1 ? [createActionRow(true, false)] : []
            });

            // Only set up collector if there are multiple pages
            if (totalPages > 1) {
                const filter = i => {
                    return (i.customId === 'prev_page' || i.customId === 'next_page') &&
                        i.user.id === interaction.user.id;
                };

                const collector = message.createMessageComponentCollector({
                    filter,
                    time: 300000, // 5 minutes
                    componentType: ComponentType.Button
                });

                collector.on('collect', async i => {
                    try {
                        if (i.customId === 'prev_page' && currentPage > 0) {
                            currentPage--;
                        } else if (i.customId === 'next_page' && currentPage < totalPages - 1) {
                            currentPage++;
                        }

                        // Update the message with the new page
                        const { embed: newEmbed } = createMemberListEmbeds(currentPage, itemsPerPage);
                        await i.update({
                            embeds: [newEmbed],
                            components: [createActionRow(
                                currentPage < totalPages - 1, // hasNext
                                currentPage > 0 // hasPrev
                            )]
                        });
                    } catch (error) {
                        console.error('Error handling pagination:', error);
                        if (!i.replied) {
                            await i.reply({ content: 'An error occurred while changing pages.', ephemeral: true });
                        }
                    }
                });

                collector.on('end', (collected, reason) => {
                    // Disable all buttons when collector ends
                    const disabledRow = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId('prev_page')
                                .setLabel('⬅️ Previous')
                                .setStyle(ButtonStyle.Secondary)
                                .setDisabled(true),
                            new ButtonBuilder()
                                .setCustomId('next_page')
                                .setLabel('Next ➡️')
                                .setStyle(ButtonStyle.Secondary)
                                .setDisabled(true)
                        );

                    message.edit({ components: [disabledRow] }).catch(console.error);
                });
            }
        } catch (error) {
            console.error('Error showing guild members:', error);
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Error')
                .setDescription('An error occurred while fetching guild members. Please try again later.');

            try {
                await interaction.editReply({
                    embeds: [errorEmbed],
                    components: []
                });
            } catch (e) {
                console.error('Failed to send error message:', e);
            }
        }
    },

    // This empty line ensures proper module export formatting

    // The module.exports is already defined at the top of the file
    // This is just to ensure the file ends correctly
};
