import { EmbedFieldData, User } from "discord.js";
import { GameInstance, MessageController } from "../game";
import { addPlayer, CAH, CAHContext, CAHStates, getPointsList, isCzar, randoId, removePlayer } from "./cah";

export async function read(game: GameInstance<CAHContext, CAHStates>): Promise<CAHStates | void> {
    // Display
    let ended = false;

    let prompt = `> ${game.context.prompt.replaceAll("_", "\\_")}`
    if (!game.context.versus) {
        prompt = `Card Czar: <@${game.players[game.context.czar].id}>\n\n` + prompt;
    }

    const read = game.context.playMessage;

    read.message = player => {
        let message = prompt;

        if (player && isCzar(game, player)) {
            message += `\n\n__Please select the funniest combination of cards.__`;
        }

        let answers = game.context.shuffle.map((p, i) => {
            const player = game.context.players[p];
            let answer = game.context.prompt;
    
            if (answer.indexOf("_") === -1) {
                answer = "**" + player.playing.map(c => player.hand[c]).join(" ") + "**";
            } else for (const c of player.playing) {
                answer = answer.replace("_", "**" + (player.hand[c].endsWith(".") ? player.hand[c].substr(0, player.hand[c].length - 1) : player.hand[c]) + "**");
            }
    
            return `\`${i + 1}.\` ${answer}`;
        }).join("\n");

        message += "\n\n" + answers;

        if (game.context.versus) {
            const picked = game.context.picked[0].length + game.context.picked[1].length;
            message += `\n\n*${picked} Card Czar${picked === 1 ? ' has' : 's have'} picked their favorite card combination.*`
        }

        const fields: EmbedFieldData[] = [
            {
                name: "Prompt",
                value: message
            },
            {
                name: "Points",
                value: getPointsList(game.players, game.context.rando, game.context.players, game.context.maxPoints)
            }
        ];

        return {
            embeds: [{
                color: "#000000",
                title: CAH.name + (game.context.versus ? " — Round " + game.context.round : ""),
                fields: fields
            }],
            components: player === null && !game.context.versus ? [[
                {
                    type: "BUTTON",
                    style: "SUCCESS",
                    label: "Join",
                    customId: "join",
                    disabled: ended
                },
                {
                    type: "BUTTON",
                    style: "DANGER",
                    label: "Leave",
                    customId: "leave",
                    disabled: ended
                },
            ]] : undefined
        }
    };

    read.edit(null);
    await read.sendPlayers();

    return await new Promise<CAHStates>(resolve => {
        if (!game.context.versus) {
            game.onButtonCallback(read.channelMessage, "join", async i => {
                if (addPlayer(game, i, read)) {
                    addMessageHandler(game, i.user, read, () => ended = true, resolve);
                }
            });
            game.onButtonCallback(read.channelMessage, "leave", async i => {
                const state = await removePlayer(game, i, read, () => ended = true);
                if (state) resolve(state);
            });
        }

        for (const player of game.players) {
            addMessageHandler(game, player, read, () => ended = true, resolve);
        }
    });
}

function addMessageHandler(game: GameInstance<CAHContext, CAHStates>, player: User, message: MessageController, ended: () => void, resolve: (s: CAHStates) => void) {
    if (isCzar(game, player)) {
        game.onMessageCallback(player.dmChannel, player, async i => {
            // Get answer
            const a = parseInt(i.content);
            if (isNaN(a) || a < 1 || a > game.context.shuffle.length) {
                i.reply({ content: `Answer number must be between 1 and ${game.context.shuffle.length}.` });
                return;
            }

            const winner = game.context.players[game.context.shuffle[a - 1]];
            let answer = "> " + game.context.prompt;
    
            if (answer.indexOf("_") === -1) {
                answer += "\n> **" + winner.playing.map(c => winner.hand[c]).join(" ") + "**";
            } else for (const c of winner.playing) {
                answer = answer.replace("_", "**" + (winner.hand[c].endsWith(".") ? winner.hand[c].substr(0, winner.hand[c].length - 1) : winner.hand[c]) + "**");
            }

            // Versus mode
            if (game.context.versus) {
                game.context.picked[a - 1].push(player.id);

                const other = game.context.picked[a - 1 === 0 ? 1 : 0].indexOf(player.id);
                if (other >= 0) game.context.picked[a - 1 === 0 ? 1 : 0].splice(other, 1);

                const tsars = game.players.length - (game.context.pairs[0].includes(-1) ? 1 : 2);
                const finished = game.context.picked[0].length + game.context.picked[1].length >= tsars;

                await i.reply({ embeds: [{
                    color: "#000000",
                    fields: [{
                        name: `Selected winning card combination`,
                        value: answer
                    }]
                }]});

                if (finished) {
                    // Continue!
                    ended();
                    message.editAll();

                    let update = "";
                    if (game.context.prompt.indexOf("_") === -1) update += "\n> " + game.context.prompt.replaceAll("_", "\\_") + "\n";

                    for (let i = 0; i < 2; i++) {
                        const winshuffled = game.context.players[game.context.shuffle[i]];

                        let answer = "> " + game.context.prompt.replaceAll("_", "\\_");
                        if (answer.indexOf("_") === -1)
                            answer = "> **" + winshuffled.playing.map(c => winshuffled.hand[c]).join(" ") + "**"
                        else for (const c of winshuffled.playing)
                            answer = answer.replace("\\_", "**" + (winshuffled.hand[c].endsWith(".") ? winshuffled.hand[c].substr(0, winshuffled.hand[c].length - 1) : winshuffled.hand[c]) + "**");
                        
                        update += '\n' + (game.context.shuffle[i] === randoId ? '`Rando Cardrissian`' : `<@${game.context.shuffle[i]}>`) + '\n' + answer;
                        update += '\nVotes: ' + (game.context.picked[i].length === 0 ? "*None*" : game.context.picked[i].map(id => "<@" + id + ">").join(", ")) + "\n";
                    
                        winshuffled.points += game.context.picked[i].length;
                    }

                    await new MessageController(game, () => {
                        return { embeds: [{
                            color: "#000000",
                            fields: [{
                                name: 'The votes are in!',
                                value: update
                            }]
                        }]}
                    }).sendAll();

                    if (game.context.pairs.length <= 1 && game.context.round >= game.context.rounds) {
                        resolve("end");
                        return;
                    }

                    // Remove played cards
                    for (const player of Object.values(game.context.players)) {
                        player.hand = player.hand.filter((_c, i) => !player.playing.includes(i));
                        player.playing = [];
                    }

                    resolve("play");
                    return;
                } else {
                    message.editAll();
                }
                return;
            }

            // Continue!
            ended();
            message.editAll();

            await new MessageController(game, () => {
                return { embeds: [{
                    color: "#000000",
                    fields: [{
                        name: 'Round Winner',
                        value: `${game.context.shuffle[a - 1] === randoId ? "`Rando Cardrissian`" : `<@${game.context.shuffle[a - 1]}>`}\n${answer}`
                    }]
                }]}
            }).sendAll();

            winner.points += 1;
            if (winner.points >= game.context.maxPoints) {
                resolve("end");
                return
            }

            // Remove played cards
            for (const player of Object.values(game.context.players)) {
                player.hand = player.hand.filter((_c, i) => !player.playing.includes(i));
                player.playing = [];
            }

            resolve("play");
            return;
        });
    }
}
