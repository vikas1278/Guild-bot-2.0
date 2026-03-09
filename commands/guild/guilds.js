const { SlashCommandBuilder, EmbedBuilder } = require('@discordjs/builders');
const axios = require('axios');
require('dotenv').config();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('guilds')
        .setDescription('Lists all guilds from the database'),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: false });

        const apiUrl = process.env.GUILD_API_ENDPOINT;
        const bearerToken = process.env.BEARER_TOKEN;

        if (!apiUrl || !bearerToken) {
            return interaction.editReply('❌ Error: Missing API configuration. Please check your environment variables.');
        }

        try {
            // console.log(`[listguilds] Fetching guilds from: ${apiUrl}`);

            // First, try to get the list of guilds
            // API URL from .env already contains the action, so we don't need to add it again
            // or we risk overriding it with the wrong action
            const response = await axios.get(apiUrl, {
                headers: {
                    'Authorization': `Bearer ${bearerToken}`,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                timeout: 10000,
                validateStatus: status => status < 500  // Don't throw for 4xx errors
            });

            // console.log(`[listguilds] API Response Status: ${response.status}`);
            // console.log('[listguilds] Response Headers:', response.headers);
            // Log less data to avoid spamming console
            // console.log('[listguilds] Response Data:', JSON.stringify(response.data, null, 2));

            // Handle empty or invalid responses
            if (!response.data) {
                throw new Error('Empty response from API');
            }

            // Extract guilds from the response
            let guilds = [];
            if (response.data && response.data.items && Array.isArray(response.data.items)) {
                guilds = response.data.items;
            } else if (Array.isArray(response.data)) {
                guilds = response.data;
            } else if (response.data && response.data.data && Array.isArray(response.data.data)) {
                guilds = response.data.data;
            } else if (response.data && response.data.guilds) {
                guilds = response.data.guilds;
            } else if (typeof response.data === 'object') {
                guilds = Object.values(response.data);
            } else {
                throw new Error('Unexpected API response format');
            }

            // If we still don't have guilds, check for error message
            if (!guilds.length && response.data.message) {
                return interaction.editReply(`❌ ${response.data.message}`);
            }

            if (!guilds.length) {
                return interaction.editReply('No guilds found in the database.');
            }

            // List of colorful emojis for guilds
            const guildEmojis = [
                '🎯', '🔥', '⚡', '🎮', '🚀', '💎', '🛡️', '⚔️', '🎲', '💫',
                '🌟', '🌈', '🎪', '🎨', '🎬', '🎤', '🎧', '🎼', '🎹', '✨', '🎐'
            ];

            // Sort guilds alphabetically by name, with "Ex Hawk Eye" at the bottom
            const sortedGuilds = [...guilds].sort((a, b) => {
                const nameA = (a.guild_name || a.name || '').toLowerCase();
                const nameB = (b.guild_name || b.name || '').toLowerCase();
                
                const isExA = nameA.includes('ex hawk eye');
                const isExB = nameB.includes('ex hawk eye');
                
                if (isExA && !isExB) return 1;
                if (!isExA && isExB) return -1;
                
                return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
            });

            // Create embed
            const embed = new EmbedBuilder()
                .setTitle('🏡 Free Fire Guild List')
                .setColor(0x5865F2)
                .setTimestamp();

            // Set server banner as thumbnail if available
            const serverBanner = interaction.guild?.bannerURL({ format: 'png', size: 1024 });
            if (serverBanner) {
                embed.setThumbnail(serverBanner);
            }

            // Add each guild with a random emoji and member count
            let guildList = '';
            const maxGuilds = 20; // Limit for the list view
            const guildsToShow = sortedGuilds.slice(0, maxGuilds);

            guildsToShow.forEach((guild, index) => {
                const emoji = guildEmojis[index % guildEmojis.length]; // Cycle through emojis
                // Use the specific fields provided: guild_name, ffmax_guild_id, member_count
                const name = guild.guild_name || guild.name || `Guild ${guild.ffmax_guild_id || guild.id || index + 1}`;
                const members = guild.member_count || 0;
                guildList += `${emoji} **${name}** → \`${members}\`\n`;
            });

            // Add total guilds and the guild list to the description
            embed.setDescription(`💠 **Total Guilds:** ${guilds.length}\n\n${guildList}`);

            // Add note if there are more guilds
            if (guilds.length > maxGuilds) {
                embed.addFields({
                    name: '\u200B',
                    value: `*Showing ${maxGuilds} out of ${guilds.length} guilds.*`
                });
            }

            return interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('[listguilds] Error:', error);
            let errorMessage = '❌ Error fetching guild list';

            if (error.response) {
                // Handle HTTP errors
                const { status, statusText, data } = error.response;
                console.error(`[listguilds] API Error - Status: ${status} ${statusText}`);
                console.error('[listguilds] Error Response:', data);

                errorMessage += `\n**Status:** ${status} ${statusText}`;

                if (data && typeof data === 'object') {
                    if (data.message) errorMessage += `\n**Message:** ${data.message}`;
                    if (data.error) errorMessage += `\n**Error:** ${data.error}`;
                } else if (data) {
                    errorMessage += `\n**Response:** ${JSON.stringify(data).substring(0, 500)}`;
                }

                // Handle common status codes
                if (status === 401) {
                    errorMessage += '\n\n⚠️ Authentication failed. Please check your BEARER_TOKEN.';
                } else if (status === 404) {
                    errorMessage += '\n\n🔍 The requested resource was not found. Please check the API endpoint URL.';
                } else if (status === 500) {
                    errorMessage += '\n\n🚨 Server error. The API encountered an internal error.';
                }
            } else if (error.request) {
                // The request was made but no response was received
                console.error('[listguilds] No response received:', error.request);
                errorMessage += '\n\n🔌 No response received from the server. Please check:';
                errorMessage += '\n1. The API server is running';
                errorMessage += '\n2. The API endpoint URL is correct';
                errorMessage += '\n3. There are no network/firewall issues';
            } else if (error.code === 'ECONNABORTED') {
                errorMessage += '\n\n⏱️ Request timed out. The server took too long to respond.';
            } else {
                // Something happened in setting up the request
                console.error('[listguilds] Request setup error:', error);
                errorMessage += `\n\n${error.message}`;
            }

            // Add troubleshooting tips
            errorMessage += '\n\n🔧 **Troubleshooting Tips:**';
            errorMessage += '\n1. Check if the API server is running and accessible';
            errorMessage += '\n2. Verify the BEARER_TOKEN and GUILD_API_ENDPOINT in your .env file';
            errorMessage += '\n3. Check the server logs for more detailed error information';
            errorMessage += '\n4. Try the request with a tool like Postman to verify the API works';

            return interaction.editReply(errorMessage);
        }
    },
};
