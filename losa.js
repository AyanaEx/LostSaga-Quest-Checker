require('dotenv').config();
const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
const sql = require('mssql');

const dbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    port: parseInt(process.env.DB_PORT, 10),
    database: process.env.DB_NAME,
    options: {
        encrypt: false,
    },
};


client.on('ready', async () => {
    console.log(`The bot is online: ${client.user.tag}!`);

    const commands = [
        {
            name: 'checkquest',
            description: 'Check quest progress on mainIDX.',
            type: 1,
            options: [
                {
                    name: 'mainidx',
                    description: 'Enter MainIDX',
                    type: 3,
                    required: true,
                },
            ],
        },
    ];

    try {
        await client.application.commands.set(commands);
        console.log('Slash commands on!');
    } catch (error) {
        console.error('Slash commands off:', error);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand() || interaction.commandName !== 'checkquest') return;

    const mainIDX = interaction.options.getString('mainidx');
        
    try {
        const pool = await sql.connect(dbConfig);
        const allowedGameMaster = process.env.ALLOWED_USERS.split(',');
        if (!allowedGameMaster.includes(interaction.user.id)) {
            return interaction.reply({
                content: 'You do not have permission to use this command.',
                ephemeral: true,
            });
        }

        const query = `
            SELECT 
                g.accountIDX, 
                g.nickName,
                
                l.mainIDX, 
                l.subIDX,
                l.logType
            FROM 
                LosaGame.dbo.userMemberDB AS g
            INNER JOIN 
                LosaLogData.dbo.log_data_quest AS l
            ON 
                g.accountIDX = l.accountIDX
            WHERE 
                l.mainIDX = @mainIDX AND l.logType = 3;
        `;

        const result = await pool.request()
            .input('mainIDX', sql.VarChar, mainIDX)
            .query(query);

        if (result.recordset.length === 0) {
            await interaction.reply({
                content: `Quest data with Main IDX "${mainIDX}" not found.`,
                ephemeral: true,
            });
            return;
        }
        const data = result.recordset.map(row => ({
            accountIDX: row.accountIDX,
            nickName: row.nickName || 'Not Found',
            // Delete the vipStatus comment line, if you have a Database function from ElaimSaga or AcademiaSaga 
            // vipStatus: row.is_vip_state === 1 ? 'VIP Active' : 'VIP Not Active',
            mainIDX: row.mainIDX,
            subIDX: row.subIDX,
            logType: 'Quest Completed',
        }));
        
        const itemsPerPage = 3;
        let currentPage = 0;
        
        const generateEmbed = (page) => {
            const embed = new EmbedBuilder()
                .setColor(0x00AE86)
                .setTitle('Hack Quest Checker')
                .setDescription(`Result Quest Checker : **${mainIDX}**`)
                .setTimestamp();
        
            const start = page * itemsPerPage;
            const end = start + itemsPerPage;
            const paginatedData = data.slice(start, end);
        
            paginatedData.forEach(item => {
                embed.addFields(
                    { name: 'NickName', value: `${item.nickName}`, inline: true },
                    // { name: 'Status VIP', value: `${item.vipStatus}`, inline: true },
                    { name: 'Status Quest', value: `${item.logType}`, inline: true },
                );
            });
        
            embed.setFooter({ text: `Page ${page + 1} of ${Math.ceil(data.length / itemsPerPage)}` });
            return embed;
        };
        
        const nextButton = new ButtonBuilder()
            .setCustomId('next')
            .setLabel('➡️ Next')
            .setStyle(ButtonStyle.Primary);
        
        const backButton = new ButtonBuilder()
            .setCustomId('back')
            .setLabel('⬅️ Back')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(true);
        
        const actionRow = new ActionRowBuilder().addComponents(backButton, nextButton);
        
        const message = await interaction.reply({
            embeds: [generateEmbed(currentPage)],
            components: [actionRow],
            fetchReply: true,
        });
        
        const collector = message.createMessageComponentCollector({ time: 60000 }); // 60 Sec
        
        collector.on('collect', async (buttonInteraction) => {
            if (buttonInteraction.user.id !== interaction.user.id) {
                return buttonInteraction.reply({
                    content: 'You can t control this embed.',
                    ephemeral: true,
                });
            }
        
            if (buttonInteraction.customId === 'next') {
                currentPage++;
            } else if (buttonInteraction.customId === 'back') {
                currentPage--;
            }
            backButton.setDisabled(currentPage === 0);
            nextButton.setDisabled(currentPage === Math.floor(data.length / itemsPerPage));
        
            await buttonInteraction.update({
                embeds: [generateEmbed(currentPage)],
                components: [actionRow],
            });
        });
        
        collector.on('end', () => {
            nextButton.setDisabled(true);
            backButton.setDisabled(true);
        
            interaction.editReply({ components: [actionRow] });
        });
            } catch (error) {
        console.error('An error occurred while fetching quest data:', error);
        await interaction.reply({
            content: 'An error occurred while fetching quest data. Please try again.',
            ephemeral: true,
        });
            }
        });

client.login(process.env.DISCORD_BOT_TOKEN);
