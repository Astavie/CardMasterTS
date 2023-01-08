import { ActionRowData, APIEmbedField, ButtonComponentData, ButtonStyle, ComponentType, MessageActionRowComponentData, MessageComponentInteraction, ModalMessageModalSubmitInteraction, TextInputModalData, User } from 'discord.js';
import { countBlanks, escapeDiscord, fillBlanks, fillModal, shuffle } from '../../util/card';
import { createButtonGrid, MessageOptions } from '../../util/message';
import { FullContext, Logic, Resolve, singleResolve } from '../logic';
import { getBlackCard, getWhiteCard, randoId, realizeWhiteCard, RoundContext } from './cah';

async function message({ ctx, players, guildid }: FullContext<RoundContext>, player: User | null): Promise<MessageOptions> {
    let prompt = await getBlackCard(guildid, ctx.prompt);
    const blanks = countBlanks(prompt);
    
    const fields: APIEmbedField[] = [];
    const components: ActionRowData<MessageActionRowComponentData>[] = [];

    const allPlaying = Object.entries(ctx.playing).filter(([k, _v]) => k !== randoId).map(([_k, v]) => v);
    const playedCards = ctx.quiplash ? allPlaying.filter(p => p !== null).length : allPlaying.filter(p => !p.includes(null)).length;
    const totalPlayers = players.length - 1;

    if (player && player !== players[ctx.czar]) {

        if (!ctx.quiplash) {

            const playing = ctx.playing[player.id];
            const hand = ctx.hand[player.id];

            let cards: (string | null)[] = [];
            if (playing === 'double') {
                cards = await Promise.all(ctx.doubleornothing![player.id].cards.map(c => getWhiteCard(guildid, c)));
                const missing = blanks - cards.length;
                for (let i = 0; i < missing; i++) {
                    cards.push(cards[i]);
                }
            } else {
                cards = await Promise.all(playing.map(i => i !== null ? getWhiteCard(guildid, hand[i]) : null));
            }
            prompt = fillBlanks(prompt, cards);

            fields.push({
                name: 'Hand',
                value: (await Promise.all(hand.map(async (c, i) => `\`${(i + 1).toString().padStart(2)}.\` ${await getWhiteCard(guildid, c)}`))).join('\n'),
            });
 
            if (ctx.doubleornothing && player.id in ctx.doubleornothing) fields.push({
                name: 'Last cards played',
                value: (await Promise.all(ctx.doubleornothing[player.id].cards.map(c => getWhiteCard(guildid, c)))).join('\n'),
            })

            const playingStyle    = (playing !== 'double' && !playing.includes(null)) ? ButtonStyle.Success : ButtonStyle.Primary;
            const disableUnplayed = (playing !== 'double' && !playing.includes(null)) && blanks > 1;

            components.push(...createButtonGrid(ctx.handCards, i => ({
                style: playing !== 'double' && playing.includes(i) ? playingStyle : ButtonStyle.Secondary,
                label: (i + 1).toString(),
                customId: `hand_${i}`,
                disabled: disableUnplayed && !playing.includes(i),
            })));

        } else {

            const playing = ctx.playing[player.id];
            if (playing !== 'random' && playing !== null) prompt = fillBlanks(prompt, playing);

            components.push({
                type: ComponentType.ActionRow,
                components: [{
                    type: ComponentType.Button,
                    style: playing === 'random' || playing === null ? ButtonStyle.Secondary : ButtonStyle.Success,
                    label: 'Fill',
                    customId: 'fill',
                    disabled: playing === 'random',
                }, {
                    type: ComponentType.Button,
                    style: playing === 'random' ? ButtonStyle.Success : ButtonStyle.Secondary,
                    label: 'Random',
                    customId: 'random',
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
        const buttons: ButtonComponentData[] = [{
            type: ComponentType.Button,
            customId: '_leave',
            style: ButtonStyle.Danger,
            label: 'Leave',
        }];
        if (player !== players[ctx.czar] && !ctx.quiplash && ctx.doubleornothing && player.id in ctx.doubleornothing) {
            buttons.unshift({
                type: ComponentType.Button,
                customId: 'double',
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
        forceList: true,
    };
}

export const handLogic: Logic<void, RoundContext> = singleResolve({
    async onEvent(full, event, resolve) {
        const { ctx, players, game, guildid } = full;
        switch (event.type) {
        case 'update':
            game.updateMessage(players, p => message(full, p));
        break;
        case 'add':
            game.updateMessage(players, p => message(full, p), event.interaction);
        break;
        case 'remove':
            if (players.length > 2) {
                resolveWhenPlayersDone(full, event.interaction, resolve);
            }
        break;
        case 'interaction':
            const i = event.interaction;
            if (!ctx.quiplash) {
                if (i.customId === 'double') {
                    if (ctx.playing[i.user.id] === 'double') {
                        const prompt = await getBlackCard(guildid, ctx.prompt);
                        const blanks = countBlanks(prompt);
                        ctx.playing[i.user.id] = Array(blanks).fill(null)
                        game.updateMessage(players, p => message(full, p), i);
                    } else {
                        ctx.playing[i.user.id] = 'double';
                        resolveWhenPlayersDone(full, i, resolve);
                    }
                } else if (i.customId.startsWith('hand_')) {
                    const prompt = await getBlackCard(guildid, ctx.prompt);
                    const blanks = countBlanks(prompt);
                    const hand = parseInt(i.customId.substring(5));

                    const player = i.user;
                    
                    if (ctx.playing[i.user.id] === 'double') {
                        ctx.playing[i.user.id] = Array(blanks).fill(null);
                    }

                    const playing = ctx.playing[player.id] as (number | null)[];
                    const pindex = playing.indexOf(hand);
                    
                    let uindex = playing.indexOf(null);

                    if (pindex === -1) {
                        if (uindex === -1) {
                            if (blanks === 1) uindex = 0;
                            else return;
                        }
                        playing[uindex] = hand;

                        if (playing.indexOf(null) === -1) {
                            resolveWhenPlayersDone(full, i, resolve);
                        } else {
                            game.updateMessage([player], await message(full, player), i, false);
                        }
                    } else {
                        playing[pindex] = null;
                        
                        if (uindex === -1) {
                            game.updateMessage(players, p => message(full, p), i);
                        } else {
                            game.updateMessage([player], await message(full, player), i, false);
                        }
                    }
                }
            } else {
                if (i.isButton()) {
                    if (i.customId === 'fill') {
                        fillModal(await getBlackCard(guildid, ctx.prompt), i);
                    } else if (i.customId === 'random') {
                        if (ctx.playing[i.user.id] === 'random') {
                            ctx.playing[i.user.id] = null;
                            game.updateMessage(players, p => message(full, p), i);
                        } else {
                            const prompt = await getBlackCard(guildid, ctx.prompt);
                            const blanks = countBlanks(prompt);

                            const count = Object.values(ctx.playing).filter(p => p === 'random').length + 1;
                            if (count * blanks > ctx.whiteDeck.length) {
                                i.reply({ content: 'There are not enough white cards left for this option!', ephemeral: true });
                                return;
                            }

                            ctx.playing[i.user.id] = 'random';
                            resolveWhenPlayersDone(full, i, resolve);
                        }
                    }
                } else if (i.isModalSubmit() && i.customId === 'fill_modal') {
                    ctx.playing[i.user.id] = (i as ModalMessageModalSubmitInteraction).components.map(c => escapeDiscord((c.components[0] as TextInputModalData).value));
                    resolveWhenPlayersDone(full, i, resolve);
                }
            }
        break;
        }
    },

});

function allPlayersDone(ctx: RoundContext): boolean {
    if (ctx.quiplash) {
        return Object.values(ctx.playing).every(p => p !== null);
    } else {
        return Object.values(ctx.playing).every(p => p === 'double' || !p.includes(null));
    }
}

async function resolveWhenPlayersDone(full: FullContext<RoundContext>, i: MessageComponentInteraction | ModalMessageModalSubmitInteraction | undefined, resolve: Resolve<void>) {
    const { game, ctx, players, guildid } = full;
    if (allPlayersDone(ctx)) {
        // put random cards in
        if (ctx.quiplash) {
            const prompt = await getBlackCard(guildid, ctx.prompt);
            const blanks = countBlanks(prompt);
            for (const player of Object.keys(ctx.playing)) {
                if (ctx.playing[player] === 'random') {
                    const cards: string[] = [];
                    while (cards.length < blanks) {
                        cards.push(await getWhiteCard(guildid, await realizeWhiteCard(guildid, ctx.whiteDeck.pop()!, players)));
                    }
                    ctx.playing[player] = cards;
                }
            }
        }

        // shuffle everyone
        ctx.shuffle = shuffle(Object.keys(ctx.playing));

        // next part!
        await game.closeMessage(players, p => message(full, p), i, false);
        resolve();
    } else {
        game.updateMessage(players, p => message(full, p), i);
    }
}

