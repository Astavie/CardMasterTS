import { APIActionRowComponent, APIButtonComponentWithCustomId, APIEmbedField, APIMessageActionRowComponent, ButtonStyle, ComponentType, MessageComponentInteraction, ModalMessageModalSubmitInteraction, TextInputModalData, User } from 'discord.js';
import { escapeDiscord, fillBlanks, fillModal, shuffle } from '../../util/card';
import { createButtonGrid, MessageOptions } from '../../util/message';
import { Game, Logic } from '../logic';
import { Card, countBlanks, getBlackCard, getWhiteCard, randoId, realizeWhiteCard, RoundContext } from './cah';

function message(game: Game, players: User[], ctx: RoundContext, player: User | null): MessageOptions {
    let prompt = getBlackCard(game, ctx.prompt);
    const blanks = countBlanks(game, ctx.prompt);

    const fields: APIEmbedField[] = [];
    const components: APIActionRowComponent<APIMessageActionRowComponent>[] = [];

    const allPlaying = Object.entries(ctx.result).filter(([k, _v]) => k !== randoId).map(([_k, v]) => v);
    const playedCards = allPlaying.filter(p => !p.includes('\\_')).length;
    const totalPlayers = players.length - 1;

    if (player && player !== players[ctx.czar]) {

        if (!ctx.quiplash) {

            prompt = ctx.result[player.id] ?? prompt;
            const filled = !prompt.includes('\\_');

            const playing = ctx.playing[player.id];
            const hand = ctx.hand[player.id];

            fields.push({
                name: 'Hand',
                value: hand.map((c, i) => `\`${(i + 1).toString().padStart(2)}.\` ${getWhiteCard(game, c)}`).join('\n'),
            });
 
            if (ctx.doubleornothing && player.id in ctx.doubleornothing) fields.push({
                name: 'Last cards played',
                value: ctx.doubleornothing[player.id].cards.map(c => getWhiteCard(game, c)).join('\n'),
            })

            const playingStyle    = filled ? ButtonStyle.Success : ButtonStyle.Primary;
            const disableUnplayed = playing !== 'double' && filled && playing.length > 1;

            components.push(...createButtonGrid(ctx.handCards, i => ({
                style: playing !== 'double' && playing.includes(i) ? playingStyle : ButtonStyle.Secondary,
                label: (i + 1).toString(),
                custom_id: `hand_${i}`,
                disabled: disableUnplayed && !playing.includes(i),
            })));

        } else {

            prompt = ctx.result[player.id] ?? prompt;
            const playing = ctx.playing[player.id];

            // if (playing !== 'random' && playing !== null) [prompt] = fillBlanks(prompt, blanks, playing);

            components.push({
                type: ComponentType.ActionRow,
                components: [{
                    type: ComponentType.Button,
                    style: playing === 'random' || playing === null ? ButtonStyle.Secondary : ButtonStyle.Success,
                    label: 'Fill',
                    custom_id: 'fill',
                    disabled: playing === 'random',
                }, {
                    type: ComponentType.Button,
                    style: playing === 'random' ? ButtonStyle.Success : ButtonStyle.Secondary,
                    label: 'Random',
                    custom_id: 'random',
                    disabled: false,
                }]
            });
        }
    }

    prompt = `> ${prompt}`;
    prompt = `Card Czar: ${players[ctx.czar]}\n\n${prompt}`;
    prompt = `${prompt}\n\n*${playedCards}/${totalPlayers} players have selected ${blanks === 1 ? 'a card' : 'their cards'}.*`;

    fields.unshift({
        name: 'Prompt',
        value: prompt,
    });

    if (player) {
        const buttons: APIButtonComponentWithCustomId[] = [{
            type: ComponentType.Button,
            custom_id: '_leave',
            style: ButtonStyle.Danger,
            label: 'Leave',
        }];
        if (player !== players[ctx.czar] && !ctx.quiplash && ctx.doubleornothing && player.id in ctx.doubleornothing) {
            buttons.unshift({
                type: ComponentType.Button,
                custom_id: 'double',
                style: ctx.playing[player.id] === 'double' ? ButtonStyle.Success : ButtonStyle.Secondary,
                label: 'Double or nothing' + '!'.repeat(ctx.doubleornothing[player.id].amount),
            });
        }
        components.push({
            type: ComponentType.ActionRow,
            components: buttons,
        });
    }

    return {
        embeds: [{ fields: fields }],
        components,
    };
}

export const handLogic: Logic<void, RoundContext> = function* (game, players, ctx) {

    game.updateMessage(players, p => message(game, players, ctx, p));
    
    while (true) {
        const event = yield;
        switch (event.type) {
        case 'add':
            game.updateMessage(players, p => message(game, players, ctx, p), event.interaction);
        break;
        case 'remove':
            if (players.length > 2 && resolveWhenPlayersDone(game, players, ctx, event.interaction)) {
                return;
            }
        break;
        case 'interaction':
            const i = event.interaction;
            if (!ctx.quiplash) {
                if (i.customId === 'double') {
                    if (ctx.playing[i.user.id] === 'double') {
                        ctx.playing[i.user.id] = []
                        ctx.result[i.user.id] = getResult(game, ctx, []);
                        game.updateMessage(players, p => message(game, players, ctx, p), i);
                    } else {
                        ctx.playing[i.user.id] = 'double';
                        ctx.result[i.user.id] = getResult(game, ctx, ctx.doubleornothing![i.user.id].cards.map(c => getWhiteCard(game, c)), true);
                        if (resolveWhenPlayersDone(game, players, ctx, i)) return;
                    }
                } else if (i.customId.startsWith('hand_')) {
                    const blanks = countBlanks(game, ctx.prompt);
                    const hand = parseInt(i.customId.substring(5));
                    const handCards = ctx.hand[i.user.id];

                    const player = i.user;
                    
                    if (ctx.playing[i.user.id] === 'double') {
                        ctx.playing[i.user.id] = [];
                        ctx.result[i.user.id] = getResult(game, ctx, []);
                    }

                    const playing = ctx.playing[player.id] as number[];
                    const pindex = playing.indexOf(hand);
                    
                    if (pindex === -1) {
                        if (!ctx.result[i.user.id].includes('\\_')) {
                            if (blanks === 1) playing[0] = hand;
                            else break;
                        } else {
                            playing.push(hand);
                        }
                        ctx.result[i.user.id] = getResult(game, ctx, playing.map(i => getWhiteCard(game, handCards[i])));

                        if (!ctx.result[i.user.id].includes('\\_')) {
                            if (resolveWhenPlayersDone(game, players, ctx, i)) return;
                        } else {
                            game.updateMessage([player], message(game, players, ctx, player), i, false);
                        }
                    } else {
                        // remove card and all its innards
                        const splicer = (i: number) => {
                            let card = playing.splice(i, 1)[0];
                            const blanks = getWhiteCard(game, handCards[card]).match(/\\_/gi)?.length ?? 0
                            for (let i = 0; i < blanks; i++) {
                                if (playing.length <= i) break;
                                splicer(i);
                            }
                        }
                        splicer(pindex);

                        if (!ctx.result[i.user.id].includes('\\_')) {
                            ctx.result[i.user.id] = getResult(game, ctx, playing.map(i => getWhiteCard(game, handCards[i])));
                            game.updateMessage(players, p => message(game, players, ctx, p), i);
                        } else {
                            ctx.result[i.user.id] = getResult(game, ctx, playing.map(i => getWhiteCard(game, handCards[i])));
                            game.updateMessage([player], message(game, players, ctx, player), i, false);
                        }
                    }
                }
            } else {
                if (i.isButton()) {
                    if (i.customId === 'fill') {
                        fillModal(getBlackCard(game, ctx.prompt), i);
                    } else if (i.customId === 'random') {
                        if (ctx.playing[i.user.id] === 'random') {
                            ctx.playing[i.user.id] = null;
                            ctx.result[i.user.id] = getResult(game, ctx, []);
                            game.updateMessage(players, p => message(game, players, ctx, p), i);
                        } else {
                            const prompt = getBlackCard(game, ctx.prompt);
                            const blanks = countBlanks(game, ctx.prompt);

                            let randoPlaying: string[] = [];
                            let randoResult: string = fillBlanks(prompt, blanks, []);
                            while (randoResult.includes('\\_')) {
                                const card = ctx.whiteDeck.pop();
                                if (!card) break;

                                randoPlaying.push(getWhiteCard(game, realizeWhiteCard(game, card, players)));
                                randoResult = fillBlanks(prompt, blanks, randoPlaying);
                            }
                            if (randoResult.includes('\\_')) {
                                i.reply({ content: 'There are not enough white cards left for this option!', ephemeral: true });
                                break;
                            }

                            ctx.playing[i.user.id] = 'random';
                            ctx.result[i.user.id] = randoResult;
                            if (resolveWhenPlayersDone(game, players, ctx, i)) return;
                        }
                    }
                } else if (i.isModalSubmit() && i.customId === 'fill_modal') {
                    ctx.playing[i.user.id] = (i as ModalMessageModalSubmitInteraction).components.map(c => escapeDiscord((c.components[0] as TextInputModalData).value));
                    ctx.result[i.user.id] = getResult(game, ctx, ctx.playing[i.user.id] as string[]);
                    if (resolveWhenPlayersDone(game, players, ctx, i)) return;
                }
            }
        break;
        }
    }
};

function getResult(game: Game, ctx: RoundContext, playing: string[], loop = false): string {
    const prompt = getBlackCard(game, ctx.prompt);
    const holes = countBlanks(game, ctx.prompt);
    return fillBlanks(prompt, holes, playing, loop);
}

function allPlayersDone(ctx: RoundContext): boolean {
    if (ctx.quiplash) {
        return Object.values(ctx.playing).every(p => p !== null);
    } else {
        return Object.values(ctx.result).every(p => !p.includes('\\_'));
    }
}

function resolveWhenPlayersDone(game: Game, players: User[], ctx: RoundContext, i: MessageComponentInteraction | ModalMessageModalSubmitInteraction | undefined) {
    if (allPlayersDone(ctx)) {
        // shuffle everyone
        ctx.shuffle = shuffle(Object.keys(ctx.playing));

        // next part!
        game.closeMessage(players, p => message(game, players, ctx, p), i, false);
        return true;
    } else {
        game.updateMessage(players, p => message(game, players, ctx, p), i);
        return false;
    }
}

