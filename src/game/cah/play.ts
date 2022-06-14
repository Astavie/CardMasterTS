import { BaseMessageComponentOptions, EmbedFieldData, MessageActionRowComponentResolvable, MessageActionRowOptions, MessageComponentInteraction, ModalSubmitInteraction } from "discord.js";
import { MessageController } from "../../util/message";
import { GameInstance, shuffle } from "../game";
import { CAH, CAHState, getBlanks, randoId, realizeCard, CAHAction, addPlayer, removePlayer, fillCard } from "./cah";

export function play(game: GameInstance, state: CAHState, msg: MessageController): Promise<CAHAction> {
    return new Promise<CAHAction>(resolve => {
        // Get black card
        const card = state.blackDeck.pop();

        if (!card) {
            game.sendAll(new MessageController(() => ({
                embeds: [{
                    color: CAH.color,
                    description: "**The game has ended because there are no more black cards left.**"
                }]
            })));
            resolve(CAHAction.End);
            return;
        }

        state.prompt = realizeCard(card, game.players);
        const blanks = getBlanks(state.prompt);

        // Give white cards
        if (!state.flags[1]) {
            for (const player of game.players) {
                const hand = state.players[player.id].hand;
                while (hand.length < state.handCards) {
                    const card = state.whiteDeck.pop();
                    if (!card) {
                        game.sendAll(new MessageController(() => ({
                            embeds: [{
                                color: CAH.color,
                                description: "**The game has ended because there are not enough white cards left.**"
                            }]
                        })));
                        resolve(CAHAction.End);
                        return;
                    }
                    hand.push(realizeCard(card, game.players));
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
                    game.sendAll(new MessageController(() => ({
                        embeds: [{
                            color: CAH.color,
                            description: "**The game has ended because there are not enough white cards left.**"
                        }]
                    })));
                    return false;
                }
                state.players[randoId].hand.push(realizeCard(card, game.players));
            }
            state.players[randoId].playing = state.players[randoId].hand.map((_, i) => i);
        }

        const randomDisabled = state.whiteDeck.length < blanks * game.players.length;

        // Display round
        msg.message = channel => {
            const fields: EmbedFieldData[] = [];

            const player = channel.type == "DM" ? channel.recipient : undefined;

            let components: (Required<BaseMessageComponentOptions> & MessageActionRowOptions)[] = [];

            let prompt = state.prompt as string;

            if (player && game.players[state.czar] !== player) {
                const pstate = state.players[player.id];
                const playing = pstate.playing;

                if (!pstate.hidden) {
                    prompt = fillCard(prompt, pstate.hand, pstate.playing);
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
            } else {
                prompt = prompt.replaceAll("_", "\\_");
            }

            prompt = `> ${prompt}`
            prompt = `Card Czar: ${game.players[state.czar]}\n\n${prompt}`;

            const played =
                Object.values(state.players).filter(p => !p.playing.includes(undefined)).length +
                "/" +
                (Object.values(state.players).length - 1);
            
            const message = prompt + `\n\n*${played} players have selected ${blanks === 1 ? "a card" : "their cards"}.*`;

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

        // Select card logic
        msg.consumers = [m => {
            const player = m.channel.type == "DM" ? m.channel.recipient : undefined;
        
            if (!player || !game.players.includes(player) || game.players[state.czar] === player) return;

            const check = (i : MessageComponentInteraction | ModalSubmitInteraction) => {
                if (game.players.every((p, i) => state.czar === i || !state.players[p.id].playing.includes(undefined))) {
                    // All players are ready
                    msg.end(i);
                    for (const m of [...msg.messages]) {
                        if (m.channel.type == "DM") {
                            msg.endMessage(m);
                        }
                    }
                    game.resetControls();
                    resolve(CAHAction.Continue);
                } else {
                    msg.updateAll(i);
                }
            };

            if (!state.flags[1]) {
                for (let index = 0; index < state.handCards; index++) {
                    game.onButton(m, `hand_${index}`, i => {
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
                                msg.update(i);
                            }
                        } else {
                            playing[pIndex] = undefined;

                            if (uIndex === -1) {
                                msg.updateAll(i);
                            } else {
                                msg.update(i);
                            }
                        }
                    });
                }
            } else {
                const split = (state.prompt as string).split('_');

                for (let i = 0; i < split.length - 1; i++) {
                    split[i] += "_";
                }

                if (split.length > 1) {
                    const second = split.length - 2;
                    const last = split.length - 1;
                    split[second] += split.splice(last, 1)[0];
                }

                for (let i = 0; i < split.length; i++) {
                    if (split[i].length > 45) {
                        let index = split[i].indexOf('_');
                        if (index + 42 > split[i].length) index = split[i].length - 42;
                        split[i] = split[i].substring(index, index + 42) + "...";
                    }
                }
                
                game.onButton(m, "fill", async i => {
                    i.showModal({
                        customId: "fill_modal",
                        title: "Fill in the blanks",
                        components: [{
                            type: "ACTION_ROW",
                            components: split.map((s, i) => ({
                                type: "TEXT_INPUT",
                                customId: `blank_${i}`,
                                style: "SHORT",
                                label: s
                            }))
                        }]
                    })
                });

                game.onModal(m, "fill_modal", async i => {
                    state.players[player.id].hand    = i.components[0].components.map(c => c.value);
                    state.players[player.id].playing = i.components[0].components.map((_, i) => i);
                    check(i);
                });
                
                game.onButton(m, "random", async i => {
                    if (randomDisabled) return;

                    const pstate = state.players[player.id];
                    if (pstate.hidden) {
                        pstate.hidden = false;

                        for (const card of pstate.hand) state.whiteDeck.push(card);
                        shuffle(state.whiteDeck);

                        pstate.hand = [];
                        pstate.playing = Array(blanks).fill(undefined);

                        msg.updateAll(i);
                    } else {
                        pstate.hidden = true;

                        while (pstate.hand.length < blanks) pstate.hand.push(state.whiteDeck.pop() as string);
                        state.players[player.id].playing = state.players[player.id].hand.map((_, i) => i);

                        check(i);
                    }
                });
            }
        }];

        // Join and leave logic
        game.join = (i, player) => addPlayer(i, game, player, state, resolve, msg);
        game.leave = (i, player, index) => removePlayer(i, game, player, index, state, resolve, msg);

        game.addLeaveButton(msg, !state.flags[1]);
        game.addSetupLogic();
        
        game.sendAll(msg);
    });
}
