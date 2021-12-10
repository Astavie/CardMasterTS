import { MessageActionRow, MessageButton, MessageOptions, MessageSelectMenu } from "discord.js";
import { GameInstance, MessageController } from "../game";
import { drawBoard, drawPlayers, emoji, everyoneVoted, getEligibleChancellors, getName, getTitle, getUsername, getVoted, SecretHitler, SHContext, SHStates } from "./secrethitler";

export async function nominate(game: GameInstance<SHContext, SHStates>): Promise<SHStates | void> {
    // Send the board state and ask president to nominate a chancellor
    const printedBoard = drawBoard(game.context.board);
    const printedPlayers = drawPlayers(game.context.players, game.context.president);
    const chancellors = getEligibleChancellors(game.context.players, game.context.president, game.context.lastPresident, game.context.lastChancellor);
    let pick = chancellors[0];

    let started = false;
    let controller = new MessageController(game, u => {
        const president = u && game.context.players.findIndex(p => p.id === u.id) === game.context.president;

        const m: MessageOptions = {
            embeds: [{
                title: getTitle(game.context),
                color: SecretHitler.color,
                fields: [{
                    name: "Board",
                    value: printedBoard
                }, {
                    name: "Players",
                    value: printedPlayers + "\n*When the President is ready, they may nominate a Chancellor.*"
                }]
            }],
            components: president ? [
                new MessageActionRow().addComponents(
                    new MessageSelectMenu()
                        .setCustomId("pick")
                        .setPlaceholder("Nominate a Chancellor")
                        .addOptions(chancellors.map(i => ({
                            label: getUsername(game.context.players[i], game.context.players, game.players),
                            value: i.toString()
                        })))
                        .setDisabled(started)
                        .setMinValues(1)
                        .setMaxValues(1)
                )
            ] : []
        }

        return m;
    });

    // Send board state
    await controller.sendAll();

    // Wait for chancellor to be picked
    if (!game.context.players[game.context.president].bot) {
        const inter = await game.onSelect(
            controller.playerMessages[game.context.players[game.context.president].id],
            "pick"
        );

        started = true;
        controller.update(inter);
        pick = parseInt(inter.values[0]);
    }

    // Chancellor is picked
    game.context.chancellor = pick;

    // Send vote
    const pres = getName(game.context.players[game.context.president],  game.context.players);
    const chan = getName(game.context.players[game.context.chancellor], game.context.players);
    started = false;

    controller = new MessageController(game, u => {
        const player = u ? game.context.players.find(p => p.id === u.id) : null;
        const alive = player && !player.dead;
        const voted = getVoted(game.context.players).length;

        const message: MessageOptions = {
            embeds: [{
                title: getTitle(game.context),
                color: SecretHitler.color,
                fields: [{
                    name: `${emoji.pickChancellor} Vote on the government`,
                    value: `\` President  \` ${pres}\n` +
                           `\` Chancellor \` ${chan}\n` +
                           `*${voted} ${voted === 1 ? "player has" : "players have"} voted.*`
                }]
            }],
            components: alive ? [
                new MessageActionRow().addComponents(
                    new MessageSelectMenu()
                        .setDisabled(started)
                        .setCustomId("vote")
                        .setPlaceholder(player.vote === null ? "Vote" : player.vote ? "Ja" : "Nein")
                        .addOptions({
                            label: "Ja",
                            value: "Ja"
                        }, {
                            label: "Nein",
                            value: "Nein"
                        })
                )
            ] : []
        }

        return message;
    });

    // Send vote dialog
    await controller.sendAll();

    // Wait for votes
    await new Promise<void>(resolve => {
        for (const player of game.players) {
            // Ignore dead people
            const contextp = game.context.players.find(p => p.id === player.id);
            if (contextp.dead) continue;

            // Voting
            game.onSelectCallback(controller.playerMessages[player.id], "vote", async i => {
                contextp.vote = i.values[0] === "Ja";
                const ready = everyoneVoted(game.context.players);

                await controller.updateAll(i);

                // Continue with game if everyone has voted
                if (ready) resolve();
            });
        }
    });

    // Everyone has voted
    started = true;
    await controller.editAll();

    console.log("EVERYONE VOTED");
}
