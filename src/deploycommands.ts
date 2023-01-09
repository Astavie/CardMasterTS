// Environment
import { config } from "dotenv";
config();

// Commands
import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';
import { SlashCommandBuilder, SlashCommandSubcommandBuilder } from "@discordjs/builders";
import { gametypes } from "./game/game";

const commands = [
    new SlashCommandBuilder().setName('ping').setDescription('Replies with pong!'),
    new SlashCommandBuilder().setName('stop').setDescription('Stops the game in the current channel.'),
    new SlashCommandBuilder().setName('pack')
        .addSubcommand(new SlashCommandSubcommandBuilder().setName('list').setDescription('List all packs within this guild.'))
        .addSubcommand(new SlashCommandSubcommandBuilder()
            .setName('add')
            .addStringOption(option => option.setName('pack').setRequired(true).setDescription('The name of the new pack.'))
            .addStringOption(option => option.setName('url').setRequired(true).setDescription('The URL containing pack data.'))
            .setDescription('Add a new pack to this guild.'))
        .addSubcommand(new SlashCommandSubcommandBuilder()
            .setName('remove')
            .addStringOption(option => option.setName('pack').setDescription('The pack to remove.').setRequired(true))
            .setDescription('Remove a pack from this guild.'))
        .addSubcommand(new SlashCommandSubcommandBuilder()
            .setName('refresh')
            .addStringOption(option => option.setName('pack').setDescription('The pack to refresh.').setRequired(true))
            .setDescription('Redownload a pack from this guild.'))
        .setDescription('Manage the packs of this guild.'),
    new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play a game in the current channel.')
        .addStringOption(option =>
            option.setName("game")
                .setRequired(true)
                .setDescription('The specific game to play.')
                .setChoices(...Object.keys(gametypes).map(name => ({
                    name: name,
                    value: name
                }))))
]
    .map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN as string);

rest.put(Routes.applicationCommands(process.env.CLIENT_ID as string), { body: commands })
    .then(() => console.log('Successfully registered application commands.'))
    .catch(console.error);
