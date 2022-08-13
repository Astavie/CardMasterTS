// Environment
import { config } from "dotenv";
config();

// Commands
import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';
import { SlashCommandBuilder } from "@discordjs/builders";
import { games } from "./game/game";

const commands = [
    new SlashCommandBuilder().setName('ping').setDescription('Replies with pong!'),
    new SlashCommandBuilder().setName('stop').setDescription('Stops the game in the current channel.'),
    new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play a game in the current channel.')
        .addStringOption(option =>
            option.setName("game")
                .setRequired(true)
                .setDescription('The specific game to play.')
                .setChoices(...Object.keys(games).map(name => ({
                    name: name,
                    value: name
                }))))
]
    .map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN as string);

rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID as string, process.env.GUILD_ID as string), { body: commands })
    .then(() => console.log('Successfully registered application commands.'))
    .catch(console.error);
