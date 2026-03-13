const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, PermissionFlagsBits } = require('discord.js');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

// Removed commanderdb permissions so command can be run by anyone


module.exports = {
    data: new SlashCommandBuilder()
        .setName('banlist')
        .setDescription('Shows a list of all blacklisted/banned members'),

    async execute(interaction) {
        await interaction.deferReply({ flags: 0 }); // Visible to everyone or change to { ephemeral: true } to hide

        try {


            const apiUrl = process.env.banlistapi_endpoint;
            if (!apiUrl) {
                return interaction.editReply({
                    content: '❌ Error: `banlistapi_endpoint` is not defined in the `.env` file.'
                });
            }

            // Fetch the banned members from the API
            const response = await axios.get(apiUrl, {
                headers: {
                    'Authorization': `Bearer ${process.env.BEARER_TOKEN}`,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                timeout: 10000
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

            if (!bannedMembers || bannedMembers.length === 0) {
                return interaction.editReply({
                    content: 'ℹ️ No banned members found.'
                });
            }

            // Function to create embeds for the ban list with pagination
            function createBanListEmbed(page = 0, itemsPerPage = 30) {
                const start = page * itemsPerPage;
                const end = start + itemsPerPage;
                const currentMembers = bannedMembers.slice(start, end);

                const embed = new EmbedBuilder()
                    .setColor('#FF0000') // Red for bans
                    .setTitle(`🚫 Banned Members List`)
                    .setDescription(`Total Banned Members: ${bannedMembers.length}`)
                    .setTimestamp();

                for (const member of currentMembers) {
                    const ign = member.ign || 'Unknown';
                    const discordId = member.discord_id || member.discordId || 'N/A';

                    // Add members to list format
                    const mention = discordId !== 'N/A' && discordId ? `<@${discordId}>` : '`No Discord Linked`';

                    if (!embed.data.fields || embed.data.fields.length === 0) {
                        embed.addFields({
                            name: '\u200B', // Discord requires a name, so we use a zero-width space to hide it
                            value: `**${ign}** - ${mention}`,
                            inline: false
                        });
                    } else {
                        embed.data.fields[0].value += `\n**${ign}** - ${mention}`;
                    }
                }

                // Add footer with pagination info
                const totalPages = Math.ceil(bannedMembers.length / itemsPerPage);
                embed.setFooter({
                    text: `Page ${page + 1} of ${totalPages} • ${new Date().toLocaleString()}`,
                    iconURL: interaction.client.user.displayAvatarURL()
                });

                return { embed, totalPages };
            }

            // Initialize pagination
            let currentPage = 0;
            const itemsPerPage = 30; // Number of bans per page

            // Function to create action row for pagination
            function createActionRow(hasNext, hasPrev) {
                return new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('banlist_prev')
                            .setLabel('⬅️ Previous')
                            .setStyle(ButtonStyle.Danger) // Red buttons
                            .setDisabled(!hasPrev),
                        new ButtonBuilder()
                            .setCustomId('banlist_next')
                            .setLabel('Next ➡️')
                            .setStyle(ButtonStyle.Danger)
                            .setDisabled(!hasNext)
                    );
            }

            // Send initial embed
            const { embed, totalPages } = createBanListEmbed(currentPage, itemsPerPage);
            const message = await interaction.editReply({
                embeds: [embed],
                components: totalPages > 1 ? [createActionRow(true, false)] : []
            });

            // Only set up collector if there are multiple pages
            if (totalPages > 1) {
                const filter = i => {
                    return (i.customId === 'banlist_prev' || i.customId === 'banlist_next') &&
                        i.user.id === interaction.user.id;
                };

                const collector = message.createMessageComponentCollector({
                    filter,
                    time: 300000, // 5 minutes before buttons timeout
                    componentType: ComponentType.Button
                });

                collector.on('collect', async i => {
                    try {
                        if (i.customId === 'banlist_prev' && currentPage > 0) {
                            currentPage--;
                        } else if (i.customId === 'banlist_next' && currentPage < totalPages - 1) {
                            currentPage++;
                        }

                        // Update the message with the new page
                        const { embed: newEmbed } = createBanListEmbed(currentPage, itemsPerPage);
                        await i.update({
                            embeds: [newEmbed],
                            components: [createActionRow(
                                currentPage < totalPages - 1, // hasNext
                                currentPage > 0 // hasPrev
                            )]
                        });
                    } catch (error) {
                        console.error('Error handling banlist pagination:', error);
                        if (!i.replied) {
                            await i.reply({ content: 'An error occurred while changing pages.', ephemeral: true });
                        }
                    }
                });

                collector.on('end', () => {
                    // Disable all buttons when collector ends
                    const disabledRow = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId('banlist_prev')
                                .setLabel('⬅️ Previous')
                                .setStyle(ButtonStyle.Secondary)
                                .setDisabled(true),
                            new ButtonBuilder()
                                .setCustomId('banlist_next')
                                .setLabel('Next ➡️')
                                .setStyle(ButtonStyle.Secondary)
                                .setDisabled(true)
                        );

                    message.edit({ components: [disabledRow] }).catch(console.error);
                });
            }

        } catch (error) {
            console.error('Error in banlist command:', error);
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Error')
                .setDescription('An error occurred while fetching the banlist from the API. Please try again later.');

            if (error.response) {
                errorEmbed.addFields({ name: 'Details', value: `Status Code: ${error.response.status}` });
            }

            await interaction.editReply({
                embeds: [errorEmbed],
                components: []
            });
        }
    }
};
