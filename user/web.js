const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('web')
        .setDescription('Get the link to the Hawk Eye Guild Manager website'),

    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('🌐 Hawk Eye Guild Manager')
            .setDescription(
                '> **Manage your FreeFire guild with ease.**\n\n' +
                'Log in with Discord to access your guild dashboard — view members, track ranks, and manage your guild all in one place.\n\n' +
                '✨ **Features:**\n' +
                '> 🦅 Real-time guild member overview\n' +
                '> 🏅 Rank & role tracking\n' +
                '> 🔒 Secure Discord OAuth2 login\n' +
                '> 📊 Guild stats at a glance'
            )
            .setColor(0x5865F2)
            .addFields(
                { name: '🔑 Login', value: 'Discord OAuth2', inline: true },
                { name: '🎮 Game', value: 'Free Fire Max', inline: true }
            )
            .setFooter({ text: 'Hawk Eye Official • Powered by Guild Manager' })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('Open Website')
                .setEmoji('🌐')
                .setStyle(ButtonStyle.Link)
                .setURL('https://guildmanager.hawkeyeofficial.com/')
        );

        await interaction.reply({ embeds: [embed], components: [row] });
    },
};
