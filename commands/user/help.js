const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('List all available commands'),

    async execute(interaction) {
        const commands = interaction.client.commands;
        const categories = {};

        // Group commands by category
        commands.forEach(command => {
            const category = command.category || 'Uncategorized';
            // Capitalize category name
            const formattedCategory = category.charAt(0).toUpperCase() + category.slice(1);

            if (!categories[formattedCategory]) {
                categories[formattedCategory] = [];
            }
            categories[formattedCategory].push(command);
        });

        const embed = new EmbedBuilder()
            .setTitle('📚 Bot Commands')
            .setColor(0x5865F2)
            .setDescription('Here is a list of all available commands:')
            .setTimestamp();

        // Sort categories alphabetically
        const sortedCategories = Object.keys(categories).sort();

        for (const category of sortedCategories) {
            // Sort commands alphabetically within category
            const categoryCommands = categories[category].sort((a, b) =>
                a.data.name.localeCompare(b.data.name)
            );

            const commandList = categoryCommands.map(cmd => {
                return `\`/${cmd.data.name}\` - ${cmd.data.description}`;
            }).join('\n');

            embed.addFields({
                name: `${category} Commands`,
                value: commandList || 'No commands found.',
                inline: false
            });
        }

        await interaction.reply({ embeds: [embed] });
    },
};
