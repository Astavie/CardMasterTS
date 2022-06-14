// Environment
import { config } from "dotenv";
config();

// Require the necessary discord.js classes
import { Client, Intents, Message } from 'discord.js';
import { GameInstance, gameInstances, games } from "./game/game";

// Create a new client instance
const client = new Client({ intents: [Intents.FLAGS.GUILDS] });

// When the client is ready, run this code (only once)
client.once('ready', () => {
	console.log('Ready!');
});

// On commands
client.on('interactionCreate', async interaction => {
    if (interaction.isButton()) {
		for (const game of gameInstances) {
			game.resolveButton(interaction);
		}
		return;
	} else if (interaction.isSelectMenu()) {
		for (const game of gameInstances) {
			game.resolveSelect(interaction);
		}
		return;
	} else if (interaction.isModalSubmit()) {
		for (const game of gameInstances) {
			game.resolveModal(interaction);
		}
		return;
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

			for (const game of gameInstances) {
				if (game.lobby === interaction.channel) {
					interaction.reply({ ephemeral: true, content: "There's already an active game in this channel!" });
					return;
				}
			}

			const name = interaction.options.getString("game");
			if (!name) {
				interaction.reply({ ephemeral: true, content: "Error: unknown game!" });
				return;
			}
			const newGame = games[name];
			if (!newGame) {
				interaction.reply({ ephemeral: true, content: "Error: unknown game!" });
				return;
			}

			const instance = new GameInstance(newGame);
			gameInstances.push(instance);
			instance.play(interaction);
			return;
		case "stop":
			if (!interaction.channel) {
				interaction.reply({ ephemeral: true, content: "Error: could not find channel!" });
				return;
			}

			for (const game of gameInstances) {
				if (game.lobby === interaction.channel) {
					// Send to players
					if (game.game.playedInDms) {
						for (const player of game.players) {
							player.send({ content: "Game forcefully stopped." });
						}
					}

					// Send to lobby
					await interaction.reply({ content: "Game forcefully stopped." });

					// Kill the game
					game.kill();
					gameInstances.splice(gameInstances.indexOf(game), 1);
					return;
				}
			}
			return;
	}
});

// Login to Discord with your client's token
client.login(process.env.TOKEN);
