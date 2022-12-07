"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// Environment
const dotenv_1 = require("dotenv");
(0, dotenv_1.config)();
// Commands
const rest_1 = require("@discordjs/rest");
const v10_1 = require("discord-api-types/v10");
const builders_1 = require("@discordjs/builders");
const game_1 = require("./game/game");
const commands = [
    new builders_1.SlashCommandBuilder().setName('ping').setDescription('Replies with pong!'),
    new builders_1.SlashCommandBuilder().setName('stop').setDescription('Stops the game in the current channel.'),
    new builders_1.SlashCommandBuilder()
        .setName('play')
        .setDescription('Play a game in the current channel.')
        .addStringOption(option => option.setName("game")
        .setRequired(true)
        .setDescription('The specific game to play.')
        .setChoices(...Object.keys(game_1.games).map(name => ({
        name: name,
        value: name
    }))))
]
    .map(command => command.toJSON());
const rest = new rest_1.REST({ version: '10' }).setToken(process.env.TOKEN);
rest.put(v10_1.Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: commands })
    .then(() => console.log('Successfully registered application commands.'))
    .catch(console.error);
