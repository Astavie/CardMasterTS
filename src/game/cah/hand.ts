import { BaseMessageComponentOptions, EmbedFieldData, MessageActionRowComponentResolvable, MessageActionRowOptions, MessageComponentInteraction, ModalSubmitInteraction } from "discord.js";
import { countBlanks, escapeDiscord, fillBlanks, fillModal, fillPlayers } from "../../util/card";
import { GameInstance, shuffle } from "../game";
import { CAH, CAHState, randoId, addPlayer, removePlayer, CAHContext, getBlackCard, getWhiteCard } from "./cah";

export function setupHAND(game: GameInstance<CAHContext, CAHState>): CAHState {
    // Get black card
    const card = getBlackCard(game.context);
    if (!card) {
        game.sendAll(() => ({
            embeds: [{
                color: CAH.color,
                description: "**The game has ended because there are no more black cards left.**"
            }]
        }));
        return "END";
    }

    game.context.prompt = fillPlayers(card, game.players);
    const blanks = countBlanks(game.context.prompt);

    // Give white cards
    if (!game.context.flags[1]) {
        for (const player of game.players) {
            const hand = game.context.players[player.id].hand;
            while (hand.length < game.context.handCards) {
                const card = getWhiteCard(game.context);
                if (!card) {
                    game.sendAll(() => ({
                        embeds: [{
                            color: CAH.color,
                            description: "**The game has ended because there are not enough white cards left.**"
                        }]
                    }));
                    return "END";
                }
                hand.push(fillPlayers(card, game.players));
            }
        }
    } else {
        for (const player of game.players) {
            game.context.players[player.id].hand = [];
            game.context.players[player.id].hidden = false;
        }
    }

    // Set czar
    game.context.czar = game.context.czar >= game.players.length - 1 ? 0 : game.context.czar + 1;

    // Set cards being played
    for (const player of Object.values(game.context.players)) player.playing = Array(blanks).fill(null);

    if (game.context.flags[0]) {
        game.context.players[randoId].hand = [];
        for (let i = 0; i < blanks; i++) {
            const card = getWhiteCard(game.context);
            if (!card) {
                game.sendAll(() => ({
                    embeds: [{
                        color: CAH.color,
                        description: "**The game has ended because there are not enough white cards left.**"
                    }]
                }));
                return "END";
            }
            game.context.players[randoId].hand.push(fillPlayers(card, game.players));
        }
        game.context.players[randoId].playing = game.context.players[randoId].hand.map((_, i) => i);
    }

    return "HAND";
}

export function displayHAND(game: GameInstance<CAHContext, CAHState>) {
    game.sendAll();
}

export function resumeHAND(game: GameInstance<CAHContext, CAHState>) {
    const blanks = countBlanks(game.context.prompt!);
    const randomDisabled = game.context.whiteDeck.length < blanks * game.players.length;

    // Display round
    game.activeMessage.forceList = true;

    game.activeMessage.message = channel => {
        const fields: EmbedFieldData[] = [];

        const player = channel.type == "DM" ? channel.recipient : undefined;

        let components: (Required<BaseMessageComponentOptions> & MessageActionRowOptions)[] = [];

        let prompt = game.context.prompt as string;

        const playedCards = Object.values(game.context.players).filter(p => !p.playing.includes(null)).length;
        const totalPlayers = Object.values(game.context.players).length - 1;

        if (player && game.players[game.context.czar] !== player) {
            const pstate = game.context.players[player.id];
            const playing = pstate.playing;

            if (!pstate.hidden || playedCards === totalPlayers) {
                prompt = fillBlanks(prompt, pstate.playing.map(i => typeof i !== 'number' ? i : pstate.hand[i]));
            }

            if (!game.context.flags[1]) {
                // Hand buttons
                fields.push({
                    name: "Hand",
                    value: pstate.hand.map((c, i) => `\`${(i + 1).toString().padStart(2)}.\` ${c}`).join("\n")
                });

                const playingStyle = !playing.includes(null) ? "SUCCESS" : "PRIMARY";
                const disableUnplayed = !playing.includes(null) && blanks > 1;

                let hand = 0;
                while (hand < game.context.handCards) {
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
                        if (hand >= game.context.handCards) break;
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
                        style: playing.includes(null) || pstate.hidden ? "SECONDARY" : "SUCCESS",
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
        prompt = `Card Czar: ${game.players[game.context.czar]}\n\n${prompt}`;

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
 
    const check = (i : MessageComponentInteraction | ModalSubmitInteraction): Promise<CAHState> | null => {
        if (game.players.every((p, i) => game.context.czar === i || !game.context.players[p.id].playing.includes(null))) {
            // All players are ready
            game.activeMessage.end(i);
            for (const m of Object.values({ ...game.activeMessage.messages })) {
                if (m.channel.type == "DM") {
                    game.activeMessage.endMessage(m);
                }
            }

            return Promise.resolve("READ");
        } else {
            game.activeMessage.updateAll(i);
        }
        return null;
    };

    // Select card logic
    if (!game.context.flags[1]) {
        for (let index = 0; index < game.context.handCards; index++) {
            game.onButton(`hand_${index}`, i => {
                const player = i.user;
                const playing = game.context.players[player.id].playing;
                const pIndex = playing.indexOf(index);
                let uIndex = playing.indexOf(null);
                if (pIndex === -1) {
                    if (uIndex === -1) {
                        if (blanks === 1) uIndex = 0;
                        else return null;
                    }
                    playing[uIndex] = index;

                    if (playing.indexOf(null) === -1) {
                        return check(i);
                    } else {
                        game.activeMessage.update(i);
                    }
                } else {
                    playing[pIndex] = null;

                    if (uIndex === -1) {
                        game.activeMessage.updateAll(i);
                    } else {
                        game.activeMessage.update(i);
                    }
                }
                return null;
            });
        }
    } else {
        game.onButton("fill", i => {fillModal(game.context.prompt!, i); return null;});

        game.onModal("fill_modal", i => {
            const player = i.user;
            game.context.players[player.id].playing = i.components.map(c => escapeDiscord(c.components[0].value));
            return check(i);
        });

        game.onButton("random", i => {
            const player = i.user;
            const pstate = game.context.players[player.id];
            if (pstate.hidden) {
                pstate.hidden = false;
                pstate.playing = Array(blanks).fill(null);
                game.activeMessage.updateAll(i);
                return null;
            } else {
                pstate.hidden = true;
                pstate.playing = [];
                while (pstate.playing.length < blanks) pstate.playing.push(getWhiteCard(game.context)!);
                return check(i);
            }
        });
    }

    // Join and leave logic
    game.join = (i, player) => addPlayer(i, game, player);
    game.leave = (i, player, index) => removePlayer(i, game, player, index);
    game.minPlayers = () => 2;
    game.maxPlayers = () => 20;
    game.addLeaveButton(!game.context.flags[1]);
    game.addSupportedLogic();
}
