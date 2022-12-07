"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// Environment
const dotenv_1 = require("dotenv");
(0, dotenv_1.config)();
// Commands
const rest_1 = require("@discordjs/rest");
const v10_1 = require("discord-api-types/v10");
const rest = new rest_1.REST({ version: '10' }).setToken(process.env.TOKEN);
Promise.all([
    // guild commands
    rest.get(v10_1.Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID))
        .then((data) => {
        const promises = [];
        for (const command of data) {
            const deleteUrl = `${v10_1.Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID)}/${command.id}`;
            promises.push(rest.delete(deleteUrl));
        }
        return Promise.all(promises);
    }),
    // global commands
    rest.get(v10_1.Routes.applicationCommands(process.env.CLIENT_ID))
        .then((data) => {
        const promises = [];
        for (const command of data) {
            const deleteUrl = `${v10_1.Routes.applicationCommands(process.env.CLIENT_ID)}/${command.id}`;
            promises.push(rest.delete(deleteUrl));
        }
        return Promise.all(promises);
    })
])
    .then(() => console.log('Nuked all application commands.'))
    .catch(console.error);
