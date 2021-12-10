import { EmbedFieldData, User } from "discord.js";
import { GameInstance, MessageController, shuffle } from "../game";
import { addPlayer, CAH, CAHContext, CAHStates, getBlanks, getPointsList, isCzar, randoId, realizeCard, removePlayer } from "./cah";

export async function play(game: GameInstance<CAHContext, CAHStates>): Promise<CAHStates | void> {

    // Get black card
    if (game.context.blackDeck.length === 0) {
        new MessageController(game, () => {
            return {
                embeds: [{
                    color: "#000000",
                    description: "**The game has ended because there are no more black cards left.**"
                }]
            }
        }).sendAll();
        return "end";
    }

    game.context.prompt = realizeCard(game.context.blackDeck.pop(), game.players);
    const blanks = getBlanks(game.context.prompt);

    // Give white cards
    if (!game.context.quiplash) {
        for (const player of game.players) {
            const hand = game.context.players[player.id].hand;
            while (hand.length < game.context.handCards) {
                if (game.context.whiteDeck.length <= 0) {
                    new MessageController(game, () => {
                        return {
                            embeds: [{
                                color: "#000000",
                                description: "**The game has ended because there are not enough white cards left.**"
                            }]
                        }
                    }).sendAll();
                    return "end";
                }
                hand.push(realizeCard(game.context.whiteDeck.pop(), game.players));
            }
        }
    }

    // Set czar
    game.context.czar = game.context.czar >= game.players.length - 1 ? 0 : game.context.czar + 1;

    // Generate pairs for 1v1 mode
    if (game.context.versus) {
        game.context.picked = [];

        if (game.context.pairs.length) game.context.pairs.shift();
        game.context.picked.push([]);
        game.context.picked.push([]);

        if (!game.context.pairs.length) {
            let players = Object.keys(game.context.players).map((_p, i) => i);
            if (game.context.rando) players = players.map(i => i - 1);

            shuffle(players);

            players.push(players[0]);
            for (let i = 0; i < players.length - 1; i++) {
                game.context.pairs.push([players[i], players[i + 1]]);
            }

            if (game.players.length === 2) {
                game.context.pairs = game.context.pairs.filter(p => p[0] === -1 || p[1] === -1);
            }

            shuffle(game.context.pairs);
            game.context.round += 1;
        }
    }

    // Set cards being played
    for (const player of Object.values(game.context.players)) player.playing = [];

    if (game.context.rando) {
        game.context.players[randoId].hand = [];
        if (!game.context.versus || game.context.pairs[0].includes(-1)) {
            for (let i = 0; i < blanks; i++) {
                if (game.context.whiteDeck.length <= 0) {
                    new MessageController(game, () => {
                        return {
                            embeds: [{
                                color: "#000000",
                                description: "**The game has ended because there are not enough white cards left.**"
                            }]
                        }
                    }).sendAll();
                    return "end";
                }
                game.context.players[randoId].hand.push(realizeCard(game.context.whiteDeck.pop(), game.players));
            }
            game.context.players[randoId].playing = game.context.players[randoId].hand.map((_c, i) => i);
        }
    }

    // Display round
    let ended = false;

    let prompt = `> ${game.context.prompt.replaceAll("_", "\\_")}`
    if (!game.context.versus) {
        prompt = `Card Czar: <@${game.players[game.context.czar].id}>\n\n` + prompt;
    }

    const play = new MessageController(game, player => {
        const played = Object.values(game.context.players).filter(p => p.playing.length === blanks).length;
        const message = prompt + `\n\n*${played} player${played === 1 ? " has" : "s have"} selected ${blanks === 1 ? "a card" : "their cards"}.*`;

        const fields: EmbedFieldData[] = [{
                name: "Prompt",
                value: message
        }];

        if (player && !isCzar(game, player)) {
            if (game.context.quiplash) {
                fields.push({
                    name: "Action",
                    value: `__Please fill in the ${blanks === 1 ? "blank below" : blanks + " blanks below, seperated by newlines"}.__`
                });
            } else {
                fields.push({
                    name: "Hand",
                    value:
                        `__Please select ${blanks === 1 ? "a card" : blanks + " cards"} by typing ${blanks === 1 ? "its number" : "their numbers seperated by spaces"} below.__\n\n` +
                        game.context.players[player.id].hand.map((c, i) => `\`${i + 1}.\` ${c}`).join("\n")
                });
            }
        }

        fields.push({
            name: "Points",
            value: getPointsList(game.players, game.context.rando, game.context.players, game.context.maxPoints)
        })

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
    });

    await play.sendAll();

    return await new Promise<CAHStates>(resolve => {
        if (!game.context.versus) {
            game.onButtonCallback(play.channelMessage, "join", async i => {
                if (addPlayer(game, i, play)) {
                    addMessageHandler(game, i.user, blanks, play, resolve);
                }
            });
            game.onButtonCallback(play.channelMessage, "leave", async i => {
                const state = await removePlayer(game, i, play, () => ended = true);
                if (state) {
                    resolve(state);
                }
            });
        }

        for (const player of game.players) {
            addMessageHandler(game, player, blanks, play, resolve);
        }
    });
}

function addMessageHandler(game: GameInstance<CAHContext, CAHStates>, player: User, blanks: number, message: MessageController, resolve: (s: CAHStates) => void) {
    if (!isCzar(game, player)) {
        game.onMessageCallback(player.dmChannel, player, async i => {
            // Get cards
            let selected = [];

            if (game.context.quiplash) {
                selected = i.content.split("\n");
            } else {
                for (const s of i.content.split(" ")) {
                    if (s.trim() === "") continue;

                    const card = parseInt(s);
                    if (isNaN(card) || card < 1 || card > game.context.handCards) {
                        i.reply({ content: "Card number must be between 1 and " + game.context.handCards + "." })
                        return;
                    }

                    selected.push(card - 1);
                }
            }

            // Check if right amount
            if (selected.length !== blanks) {
                i.reply({ content: game.context.quiplash ? `You must fill in ${blanks} ${blanks === 1 ? 'blank' : 'blanks'}.` : `You must select ${blanks} ${blanks === 1 ? 'card' : 'cards'}.` })
                return;
            }

            // Assign
            if (game.context.quiplash) {
                game.context.players[player.id].hand = selected;
                game.context.players[player.id].playing = selected.map((_s, i) => i);
            } else {
                game.context.players[player.id].playing = selected;
            }

            // Check if everyone is done now
            const finished = !game.players.some(p => !isCzar(game, p) && game.context.players[p.id].playing.length !== blanks);

            // Display
            await i.reply({ embeds: [{
                color: "#000000",
                fields: [{
                    name: `Selected ${blanks === 1 ? 'card' : 'cards'}`,
                    value: game.context.players[player.id].playing.map(s => "`" + (s + 1) + ".` " + game.context.players[player.id].hand[s]).join("\n")
                }]
            }]});

            // Continue!
            if (finished) {
                message.editAll();

                // Shuffle players
                game.context.shuffle = game.players.filter(p => !isCzar(game, p) && game.context.players[p.id].playing.length === blanks).map(p => p.id);
                if (game.context.rando && (!game.context.versus || game.context.pairs[0].includes(-1))) game.context.shuffle.push(randoId);
                shuffle(game.context.shuffle);

                // continue
                game.context.playMessage = message;
                resolve("read");
            } else {
                message.editAll();
            }
        });
    }
}
