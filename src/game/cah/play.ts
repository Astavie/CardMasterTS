import { BaseMessageComponentOptions, EmbedFieldData, MessageActionRowComponentResolvable, MessageActionRowOptions } from "discord.js";
import { MessageController } from "../../util/message";
import { GameInstance } from "../game";
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

        // Set czar
        state.czar = state.czar >= game.players.length - 1 ? 0 : state.czar + 1;

        // Set cards being played
        for (const player of Object.values(state.players)) player.playing = Array(blanks).fill(undefined);

        if (state.rando) {
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

        // Display round
        msg.message = channel => {
            const fields: EmbedFieldData[] = [];

            const player = channel.type == "DM" ? channel.recipient : undefined;

            let components: (Required<BaseMessageComponentOptions> & MessageActionRowOptions)[] = [];

            let prompt = state.prompt as string;

            if (player && game.players[state.czar] !== player) {
                prompt = fillCard(prompt, state.players[player.id].hand, state.players[player.id].playing);

                fields.push({
                    name: "Hand",
                    value: state.players[player.id].hand.map((c, i) => `\`${(i + 1).toString().padStart(2)}.\` ${c}`).join("\n")
                });

                const playing = state.players[player.id].playing;
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
        }];

        // Join and leave logic
        game.join = (i, player) => addPlayer(i, game, player, state, resolve, msg);
        game.leave = (i, player, index) => removePlayer(i, game, player, index, state, resolve, msg);

        game.addLeaveButton(msg);
        game.addSetupLogic();
        
        game.sendAll(msg);
    });
}
