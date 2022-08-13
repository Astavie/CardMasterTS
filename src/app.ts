// Environment
import { config } from "dotenv";
config();

// Require the necessary discord.js classes
import { Client, Intents } from 'discord.js';
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
            if (game.isMyInteraction(interaction)) {
                game.resolveButton(interaction);
                return;
            }
		}
		return;
	} else if (interaction.isSelectMenu()) {
		for (const game of gameInstances) {
            if (game.isMyInteraction(interaction)) {
                game.resolveSelect(interaction);
                return;
            }
		}
		return;
	} else if (interaction.isModalSubmit()) {
		for (const game of gameInstances) {
            if (game.isMyInteraction(interaction)) {
                game.resolveModal(interaction);
                return;
            }
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

			new GameInstance(newGame).play(interaction);
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
					return;
				}
			}


            interaction.reply({ ephemeral: true, content: "There's no active game in this channel!" });
			return;
	}
});

// Login to Discord with your client's token
client.login(process.env.TOKEN);
