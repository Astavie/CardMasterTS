// Environment
import { config } from "dotenv";
config();

// Require the necessary discord.js classes
import { Client, Intents } from 'discord.js';
import { GameImpl, games, gametypes } from "./game/game";
import { createSave, db, loadGames, saveGames } from "./db";

// Create a new client instance
const client = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.DIRECT_MESSAGES] });

// When the client is ready, run this code (only once)
client.once('ready', async () => {
    const id = process.env.GUILD_ID!;
    const s = createSave(id);
    db[id] = s;
    games[id] = [];
    await loadGames(s);

    for (const save of s.games) {
        const game = gametypes[save.game];
        const instance = new GameImpl(game, id);
        instance.load(client, save).then(() => {
            games[id].push(instance);
            console.log(`Loaded ${save.game} game`);
        });
    }
    console.log('Ready!');
    console.log(db[id]);
});

client.on('error', e => {
    console.error(e);
});

client.on('messageCreate', message => {
    if (message.channel.type !== 'DM' || message.author.bot) return;
    const player = message.channel.recipient;

    for (const guildgames of Object.values(games)) {
        for (const game of guildgames) {
            if (game.players.includes(player)) {
                game.onMessage(message);
                return;
            }
        }
    }
});

client.on('messageUpdate', async message_ => {
    const message = await message_.fetch();

    if (message.channel.type !== 'DM' || message.author.bot) return;
    const player = message.channel.recipient;

    for (const guildgames of Object.values(games)) {
        for (const game of guildgames) {
            if (game.players.includes(player)) {
                game.onMessage(message);
                return;
            }
        }
    }
});

// On commands
client.on('interactionCreate', interaction => {
    if (interaction.isMessageComponent() || interaction.isModalSubmit()) {
        for (const guildgames of Object.values(games)) {
            for (const game of guildgames) {
                if (game.isMyInteraction(interaction)) {
                    game.onInteraction(interaction);
                    return;
                }
            }
        }
    }
    
    if (!interaction.isCommand()) return;

    switch (interaction.commandName) {
        case "ping":
            interaction.reply('Pong!');
            return;
        case "pack":
            switch (interaction.options.getSubcommand()) {
                case "list":
                    // TODO
                    interaction.reply({ content: Object.keys(db[interaction.guildId!].packs).join() });
                    break;
                case "add":
                    const name = interaction.options.getString('pack')!;
                    const url = interaction.options.getString('url')!;
                    // TODO: Validate pack
                    db[interaction.guildId!].packs[name] = url;
                    saveGames(db[interaction.guildId!]);
                    interaction.reply({ content: `Pack \`${name}\` located at ${url} added!` });
                    break;
                case "remove":
                    const name2 = interaction.options.getString('pack')!;
                    // TODO: Validate name
                    delete db[interaction.guildId!].packs[name2];
                    saveGames(db[interaction.guildId!]);
                    interaction.reply({ content: `Pack \`${name2}\` removed!` });
                    break;
            }
            break;
        case "play":
            if (!interaction.channel) {
                interaction.reply({ ephemeral: true, content: "Error: could not find channel!" });
                return;
            }

            for (const game of games[interaction.guildId!]) {
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

            new GameImpl(newGame, interaction.guildId!).start(interaction);
            return;
        case "stop":
            if (!interaction.channel) {
                interaction.reply({ ephemeral: true, content: "Error: could not find channel!" });
                return;
            }

            let found = 0;

            for (const game of games[interaction.guildId!]) {
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
            break;
    }
});

// Login to Discord with your client's token
client.login(process.env.TOKEN);

process.on("exit", async () => {
    for (const [guild, save] of Object.entries(db)) {
        save.games = games[guild].map(g => g.save());
        saveGames(save);
    }
});

process.on("SIGINT", async () => {
    process.exit();
});
