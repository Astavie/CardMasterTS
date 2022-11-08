// Environment
import { config } from "dotenv";
config();

// Require the necessary discord.js classes
import { Client, Intents } from 'discord.js';
import { GameImpl, games, GameSave, gametypes } from "./game/game";
import Nedb = require("nedb");

// Create a new client instance
const client = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.DIRECT_MESSAGES] });

// Create db
const db = new Nedb({ filename: "db/games", autoload: true });

// When the client is ready, run this code (only once)
client.once('ready', async () => {
    db.find({}, (_: unknown, docs: GameSave<unknown>[]) => {
        for (const save of docs) {
            const game = gametypes[save.game];
            const instance = new GameImpl(game);
            instance.load(client, save).then(() => {
                games.push(instance);
                console.log(`Loaded ${save.game} game`);
            });
        }

        console.log('Ready!');
    })
});

client.on('error', e => {
    console.error(e);
});

client.on('messageCreate', message => {
    if (message.channel.type !== 'DM' || message.author.bot) return;
    const player = message.channel.recipient;

    for (const game of games) {
        if (game.players.includes(player)) {
            game.onMessage(message);
            return;
        }
    }
});

client.on('messageUpdate', async message_ => {
    const message = await message_.fetch();

    if (message.channel.type !== 'DM' || message.author.bot) return;
    const player = message.channel.recipient;

    for (const game of games) {
        if (game.players.includes(player)) {
            game.onMessage(message);
            return;
        }
    }
});

// On commands
client.on('interactionCreate', interaction => {
    if (interaction.isMessageComponent() || interaction.isModalSubmit()) {
        for (const game of games) {
            if (game.isMyInteraction(interaction)) {
                game.onInteraction(interaction);
                return;
            }
        }
    }
    
    if (!interaction.isCommand()) return;

    switch (interaction.commandName) {
        case "ping":
            interaction.reply('Pong!');
            return;
        case "play":
            if (!interaction.channel) {
                interaction.reply({ ephemeral: true, content: "Error: could not find channel!" });
                return;
            }

            for (const game of games) {
                if (game.lobby === interaction.channel) {
                    interaction.reply({ ephemeral: true, content: "There is already an active game in this channel!" });
                    return;
                }
            }

            const name = interaction.options.getString("game");
            if (!name) {
                interaction.reply({ ephemeral: true, content: "Error: unknown game!" });
                return;
            }
            const newGame = gametypes[name];
            if (!newGame) {
                interaction.reply({ ephemeral: true, content: "Error: unknown game!" });
                return;
            }

            new GameImpl(newGame).start(interaction);
            return;
        case "stop":
            if (!interaction.channel) {
                interaction.reply({ ephemeral: true, content: "Error: could not find channel!" });
                return;
            }

            let found = 0;

            for (const game of games) {
                if (game.lobby === interaction.channel || interaction.channelId === Object.keys(game.lobbyMessage.messages)[0]) {
                    // Kill the game
                    game.end();

                    // Send to lobby
                    found += 1;
                }
            }

            if (found > 1) {
                interaction.reply({ content: found + " games forcefully stopped." });
            } else if (found) {
                interaction.reply({ content: "Game forcefully stopped." });
            } else {
                interaction.reply({ ephemeral: true, content: "There is no active game in this channel!" });
            }
    }
});

// Login to Discord with your client's token
client.login(process.env.TOKEN);

process.on("exit", () => {
    db.remove({}, () => {
        db.insert(games.map(g => g.save()), () => {
            console.log("Saved games");
        });
    });
});

process.on('SIGINT', () => {
    db.remove({}, () => {
        db.insert(games.map(g => g.save()), () => {
            console.log("Saved games");
            process.exit();
        });
    });
});

