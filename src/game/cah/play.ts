import { BaseMessageComponentOptions, EmbedFieldData, MessageActionRowComponentResolvable, MessageActionRowOptions, MessageComponentInteraction, ModalSubmitInteraction } from "discord.js";
import { countBlanks, escapeDiscord, fillBlanks, fillModal, fillPlayers } from "../../util/card";
import { GameInstance, shuffle } from "../game";
import { CAH, CAHState, randoId, CAHAction, addPlayer, removePlayer } from "./cah";

export function play(game: GameInstance, state: CAHState): Promise<CAHAction> {
    return new Promise<CAHAction>(resolve => {
        // Get black card
        const card = state.blackDeck.pop();

        if (!card) {
            game.sendAll(() => ({
                embeds: [{
                    color: CAH.color,
                    description: "**The game has ended because there are no more black cards left.**"
                }]
            }));
            resolve(CAHAction.End);
            return;
        }

        state.prompt = fillPlayers(card, game.players);
        const blanks = countBlanks(state.prompt);

        // Give white cards
        if (!state.flags[1]) {
            for (const player of game.players) {
                const hand = state.players[player.id].hand;
                while (hand.length < state.handCards) {
                    const card = state.whiteDeck.pop();
                    if (!card) {
                        game.sendAll(() => ({
                            embeds: [{
                                color: CAH.color,
                                description: "**The game has ended because there are not enough white cards left.**"
                            }]
                        }));
                        resolve(CAHAction.End);
                        return;
                    }
                    hand.push(fillPlayers(card, game.players));
                }
            }
        } else {
            for (const player of game.players) {
                state.players[player.id].hand = [];
                state.players[player.id].hidden = false;
            }
        }

        // Set czar
        state.czar = state.czar >= game.players.length - 1 ? 0 : state.czar + 1;

        // Set cards being played
        for (const player of Object.values(state.players)) player.playing = Array(blanks).fill(undefined);

        if (state.flags[0]) {
            state.players[randoId].hand = [];
            for (let i = 0; i < blanks; i++) {
                const card = state.whiteDeck.pop();
                if (!card) {
                    game.sendAll(() => ({
                        embeds: [{
                            color: CAH.color,
                            description: "**The game has ended because there are not enough white cards left.**"
                        }]
                    }));
                    return false;
                }
                state.players[randoId].hand.push(fillPlayers(card, game.players));
            }
            state.players[randoId].playing = state.players[randoId].hand.map((_, i) => i);
        }

        const randomDisabled = state.whiteDeck.length < blanks * game.players.length;

        // Display round
        game.activeMessage!.message = channel => {
            const fields: EmbedFieldData[] = [];

            const player = channel.type == "DM" ? channel.recipient : undefined;

            let components: (Required<BaseMessageComponentOptions> & MessageActionRowOptions)[] = [];

            let prompt = state.prompt as string;

            const playedCards = Object.values(state.players).filter(p => !p.playing.includes(undefined)).length;
            const totalPlayers = Object.values(state.players).length - 1;

            if (player && game.players[state.czar] !== player) {
                const pstate = state.players[player.id];
                const playing = pstate.playing;

                if (!pstate.hidden || playedCards === totalPlayers) {
                    prompt = fillBlanks(prompt, pstate.playing.map(i => i === undefined ? undefined : pstate.hand[i]));
                }

                if (!state.flags[1]) {
                    // Hand buttons
                    fields.push({
                        name: "Hand",
                        value: pstate.hand.map((c, i) => `\`${(i + 1).toString().padStart(2)}.\` ${c}`).join("\n")
                    });

                    const playingStyle = !playing.includes(undefined) ? "SUCCESS" : "PRIMARY";
                    const disableUnplayed = !playing.includes(undefined) && blanks > 1;

                    let hand = 0;
                    while (hand < state.handCards) {
                        const row: MessageActionRowComponentResolvable[] = [];
                        for (let i = 0; i < 5; i++) {
                            row.push({
                                type: "BUTTON",
                                style: playing.includes(hand) ? playingStyle : "SECONDARY",
                                label: (hand + 1).toString(),
                                customId: `hand_${hand}`,
                                disabled: !playing.includes(hand) && disableUnplayed,
                            });

                            hand++;
                            if (hand >= state.handCards) break;
                        }
                        components.push({
                            type: "ACTION_ROW",
                            components: row
                        });
                    }
                } else {
                    // Fill modal
                    components.push({
                        type: "ACTION_ROW",
                        components: [{
                            type: "BUTTON",
                            style: playing.includes(undefined) || pstate.hidden ? "SECONDARY" : "SUCCESS",
                            label: "Fill",
                            customId: `fill`,
                            disabled: pstate.hidden,
                        }, {
                            type: "BUTTON",
                            style: pstate.hidden ? "SUCCESS" : "SECONDARY",
                            label: "Random",
                            customId: `random`,
                            disabled: randomDisabled
                        }]
                    });
                }
            }

            prompt = `> ${prompt}`
            prompt = `Card Czar: ${game.players[state.czar]}\n\n${prompt}`;

            const message = prompt + `\n\n*${playedCards}/${totalPlayers} players have selected ${blanks === 1 ? "a card" : "their cards"}.*`;

            fields.unshift({
                name: "Prompt",
                value: message
            });

            return {
                embeds: [{
                    color: CAH.color,
                    fields: fields
                }],
                components: components
            };
        };

        const check = (i : MessageComponentInteraction | ModalSubmitInteraction) => {
            if (game.players.every((p, i) => state.czar === i || !state.players[p.id].playing.includes(undefined))) {
                // All players are ready
                game.activeMessage!.end(i);
                for (const m of Object.values({ ...game.activeMessage!.messages })) {
                    if (m.channel.type == "DM") {
                        game.activeMessage!.endMessage(m);
                    }
                }
                game.resetControls();
                resolve(CAHAction.Continue);
            } else {
                game.activeMessage!.updateAll(i);
            }
        };

        // Select card logic
        if (!state.flags[1]) {
            for (let index = 0; index < state.handCards; index++) {
                game.onButton(`hand_${index}`, i => {
                    const player = i.user;
                    const playing = state.players[player.id].playing;
                    const pIndex = playing.indexOf(index);
                    let uIndex = playing.indexOf(undefined);
                    if (pIndex === -1) {
                        if (uIndex === -1) {
                            if (blanks === 1) uIndex = 0;
                            else return;
                        }
                        playing[uIndex] = index;

                        if (playing.indexOf(undefined) === -1) {
                            check(i);
                        } else {
                            game.activeMessage!.update(i);
                        }
                    } else {
                        playing[pIndex] = undefined;

                        if (uIndex === -1) {
                            game.activeMessage!.updateAll(i);
                        } else {
                            game.activeMessage!.update(i);
                        }
                    }
                });
            }
        } else {
            game.onButton("fill", fillModal(state.prompt!));

            game.onModal("fill_modal", i => {
                const player = i.user;
                state.players[player.id].hand    = i.components.map(c => escapeDiscord(c.components[0].value));
                state.players[player.id].playing = i.components.map((_, i) => i);
                check(i);
            });

            game.onButton("random", i => {
                if (randomDisabled) return;
                const player = i.user;
                const pstate = state.players[player.id];
                if (pstate.hidden) {
                    pstate.hidden = false;

                    for (const card of pstate.hand) state.whiteDeck.push(card);
                    shuffle(state.whiteDeck);

                    pstate.hand = [];
                    pstate.playing = Array(blanks).fill(undefined);

                    game.activeMessage!.updateAll(i);
                } else {
                    pstate.hidden = true;

                    while (pstate.hand.length < blanks) pstate.hand.push(state.whiteDeck.pop() as string);
                    state.players[player.id].playing = state.players[player.id].hand.map((_, i) => i);

                    check(i);
                }
            });
        }

        // Join and leave logic
        game.join = (i, player) => addPlayer(i, game, player, state, resolve);
        game.leave = (i, player, index) => removePlayer(i, game, player, index, state, resolve);

        game.addLeaveButton(!state.flags[1]);
        game.addSupportedLogic();
        
        game.sendAll();
    });
}
