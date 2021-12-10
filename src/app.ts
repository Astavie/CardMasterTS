// Environment
import { config } from "dotenv";
config();

// Bot
import { Channel, Client, Intents, User } from "discord.js"
import { GameInstance, gameInstances, games } from "./game/game";
const client = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.DIRECT_MESSAGES, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.GUILD_MESSAGE_REACTIONS, Intents.FLAGS.DIRECT_MESSAGE_REACTIONS] });

client.once("ready", () => {
    const commands = process.env.NODE_ENV === "production" ? client.application.commands : client.guilds.cache.get(process.env.EPPGROEP as any).commands;

    if (process.env.NODE_ENV !== "production") {
        client.application.commands.cache.forEach(c => client.application.commands.delete(c));
        commands.cache.forEach(c => commands.delete(c));
    }

    commands.create({
        name: 'play',
        description: 'Play a game in the current channel.',
        options: [
            {
                type: "STRING",
                name: "game",
                required: true,
                description: "The specific game to play.",
                choices: Object.keys(games).map(n => { return { name: n, value: n }})
            }
        ]
    });

    commands.create({
        name: 'stop',
        description: 'Stop the game in the current channel.'
    });

    console.log("Bot is ready!");
});

function getGameFromPlayer(player: User): GameInstance<any, any> | undefined {
    for (const game of gameInstances) {
        for (const user of game.players) {
            if (user.id === player.id) {
                return game;
            }
        }
    }
    return undefined;
}

function getGameFromChannel(channel: Channel): GameInstance<any, any> | undefined {
    for (const game of gameInstances) {
        if (channel.id === game.channel.id) {
            return game;
        }
    }
    return undefined;
}

client.on("messageCreate", message => {
    if (message.author.id === client.user.id) return;

    if (message.channel.type === "dm") {
        getGameFromPlayer(message.author)?.resolveMessage(message);
        return;
    }

    getGameFromChannel(message.channel)?.resolveMessage(message);
    return;
})

client.on('interactionCreate', async interaction => {
    if (interaction.isButton() || interaction.isSelectMenu()) {
        if (interaction.channel.type === "dm") {
            const game = getGameFromPlayer(interaction.user);
            if (game) {
                if (interaction.isButton()) game.resolveButton(interaction);
                else game.resolveSelect(interaction);
            }
            return;
        }

        const game = getGameFromChannel(interaction.channel);
        if (game) {
            if (interaction.isButton()) game.resolveButton(interaction);
            else game.resolveSelect(interaction);
        }
        return;
    }

    if (!interaction.isCommand() || !interaction.channel.isText()) return;

    if (interaction.channel.type === "dm") {
        interaction.reply({ content: "Commands are not available in DMs!", ephemeral: true });
        return;
    }

    switch (interaction.commandName) {
        case "play":
            if (getGameFromChannel(interaction.channel)) {
                interaction.reply({ ephemeral: true, content: "There's already an active game in this channel!" })
                return;
            }
            const newGame = games[interaction.options.first().value as string];
            if (!newGame) return; // Should not happen

            const instance = new GameInstance(newGame, interaction.channel);
            gameInstances.push(instance);
            instance.play(interaction);
            return;
        case "stop":
            const game = getGameFromChannel(interaction.channel);
            if (!game) {
                interaction.reply({ ephemeral: true, content: "There's no active game in this channel!" })
                return;
            }
            game.resolveKill();
            gameInstances.splice(gameInstances.indexOf(game), 1);
            interaction.reply({ content: "Game forcefully stopped." });
            return;
    }
})

client.login(process.env.TOKEN);
