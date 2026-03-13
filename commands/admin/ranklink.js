const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');

const RANK_LINKS_PATH = path.join(__dirname, '../../rank_links.json');

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
        console.error('[ranklink] Error saving rank links:', error);
        throw new Error('Failed to save rank links to file');
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
        .setName('ranklink')
        .setDescription('Link Discord roles to specific in-game ranks (Bot Owner/Commander Only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option =>
            option.setName('rank')
                .setDescription('Select the in-game rank')
                .setRequired(true)
                .addChoices(
                    { name: 'Leader', value: 'leader' },
                    { name: 'Acting Guild Leader', value: 'agl' },
                    { name: 'Officer', value: 'officer' }
                ))
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('The Discord role to link')
                .setRequired(true)),

    async execute(interaction) {
        await interaction.deferReply();

        const isCommander = await isBotCommander(interaction.user.id);
        if (!isCommander) {
            return interaction.editReply({
                content: '❌ This command can only be used by bot owners or commanders.'
            });
        }

        const rankName = interaction.options.getString('rank');
        const role = interaction.options.getRole('role');

        try {
            const rankLinks = await getRankLinks();

            const existingRankIndex = rankLinks.findIndex(r => r.rank_name === rankName);

            if (existingRankIndex !== -1) {
                if (rankLinks[existingRankIndex].role_id === role.id) {
                    return interaction.editReply({
                        content: `✅ The **${rankName}** rank is already linked to **@${role.name}** globally.`
                    });
                }
                rankLinks[existingRankIndex] = { rank_name: rankName, role_id: role.id, name: role.name };
            } else {
                rankLinks.push({ rank_name: rankName, role_id: role.id, name: role.name });
            }

            await saveRankLinks(rankLinks);

            await interaction.editReply({
                content: `✅ Successfully linked rank **${rankName}** to role **@${role.name}** globally!`
            });

        } catch (error) {
            console.error('Error in ranklink command:', error);
            await interaction.editReply({
                content: '❌ An error occurred while saving the rank link.'
            });
        }
    }
};
