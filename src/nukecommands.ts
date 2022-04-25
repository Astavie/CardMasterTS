// Environment
import { config } from "dotenv";
config();

// Commands
import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN as string);

Promise.all([
    // guild commands
    rest.get(Routes.applicationGuildCommands(process.env.CLIENT_ID as string, process.env.GUILD_ID as string))
        .then((data: any) => {
            const promises: Promise<any>[] = [];
            for (const command of data) {
                const deleteUrl: any = `${Routes.applicationGuildCommands(process.env.CLIENT_ID as string, process.env.GUILD_ID as string)}/${command.id}`;
                promises.push(rest.delete(deleteUrl));
            }
            return Promise.all(promises);
        }),
    // global commands
    rest.get(Routes.applicationCommands(process.env.CLIENT_ID as string))
        .then((data: any) => {
            const promises: Promise<any>[] = [];
            for (const command of data) {
                const deleteUrl: any = `${Routes.applicationCommands(process.env.CLIENT_ID as string)}/${command.id}`;
                promises.push(rest.delete(deleteUrl));
            }
            return Promise.all(promises);
        })
])
    .then(() => console.log('Nuked all application commands.'))
    .catch(console.error);
