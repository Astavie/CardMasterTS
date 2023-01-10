import { APIActionRowComponent, APIButtonComponentWithCustomId, APIEmbedField, APIMessageActionRowComponent, ButtonStyle, ComponentType, MessageComponentInteraction, ModalMessageModalSubmitInteraction, TextInputModalData, User } from 'discord.js';
import { countBlanks, escapeDiscord, fillBlanks, fillModal, shuffle } from '../../util/card';
import { createButtonGrid, MessageOptions } from '../../util/message';
import { Game, Logic } from '../logic';
import { getBlackCard, getWhiteCard, randoId, realizeWhiteCard, RoundContext } from './cah';

async function message(game: Game, players: User[], ctx: RoundContext, player: User | null): Promise<MessageOptions> {
    const guildid = game.getGuild();
    let prompt = await getBlackCard(guildid, ctx.prompt);
    const blanks = countBlanks(prompt);
    
    const fields: APIEmbedField[] = [];
    const components: APIActionRowComponent<APIMessageActionRowComponent>[] = [];

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
                custom_id: `hand_${i}`,
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

export const handLogic: Logic<boolean, RoundContext> = async (game, players, ctx, events) => {

    game.updateMessage(players, p => message(game, players, ctx, p));
    
    for await (const event of events) {
        switch (event.type) {
        case 'add':
            await game.updateMessage(players, p => message(game, players, ctx, p), event.interaction);
        break;
        case 'remove':
            if (players.length > 2 && await resolveWhenPlayersDone(game, players, ctx, event.interaction)) {
                return true;
            }
        break;
        case 'interaction':
            const guildid = game.getGuild();
            const i = event.interaction;
            if (!ctx.quiplash) {
                if (i.customId === 'double') {
                    if (ctx.playing[i.user.id] === 'double') {
                        const prompt = await getBlackCard(guildid, ctx.prompt);
                        const blanks = countBlanks(prompt);
                        ctx.playing[i.user.id] = Array(blanks).fill(null)
                        await game.updateMessage(players, p => message(game, players, ctx, p), i);
                    } else {
                        ctx.playing[i.user.id] = 'double';
                        if (await resolveWhenPlayersDone(game, players, ctx, i)) return true;
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
                            else break;
                        }
                        playing[uindex] = hand;

                        if (playing.indexOf(null) === -1) {
                            if (await resolveWhenPlayersDone(game, players, ctx, i)) return true;
                        } else {
                            await game.updateMessage([player], await message(game, players, ctx, player), i, false);
                        }
                    } else {
                        playing[pindex] = null;
                        
                        if (uindex === -1) {
                            await game.updateMessage(players, p => message(game, players, ctx, p), i);
                        } else {
                            await game.updateMessage([player], await message(game, players, ctx, player), i, false);
                        }
                    }
                }
            } else {
                if (i.isButton()) {
                    if (i.customId === 'fill') {
                        await fillModal(await getBlackCard(guildid, ctx.prompt), i);
                    } else if (i.customId === 'random') {
                        if (ctx.playing[i.user.id] === 'random') {
                            ctx.playing[i.user.id] = null;
                            await game.updateMessage(players, p => message(game, players, ctx, p), i);
                        } else {
                            const prompt = await getBlackCard(guildid, ctx.prompt);
                            const blanks = countBlanks(prompt);

                            const count = Object.values(ctx.playing).filter(p => p === 'random').length + 1;
                            if (count * blanks > ctx.whiteDeck.length) {
                                i.reply({ content: 'There are not enough white cards left for this option!', ephemeral: true });
                                break;
                            }

                            ctx.playing[i.user.id] = 'random';
                            if (await resolveWhenPlayersDone(game, players, ctx, i)) return true;
                        }
                    }
                } else if (i.isModalSubmit() && i.customId === 'fill_modal') {
                    ctx.playing[i.user.id] = (i as ModalMessageModalSubmitInteraction).components.map(c => escapeDiscord((c.components[0] as TextInputModalData).value));
                    if (await resolveWhenPlayersDone(game, players, ctx, i)) return true;
                }
            }
        break;
        }
     }

    return false;
};

function allPlayersDone(ctx: RoundContext): boolean {
    if (ctx.quiplash) {
        return Object.values(ctx.playing).every(p => p !== null);
    } else {
        return Object.values(ctx.playing).every(p => p === 'double' || !p.includes(null));
    }
}

async function resolveWhenPlayersDone(game: Game, players: User[], ctx: RoundContext, i: MessageComponentInteraction | ModalMessageModalSubmitInteraction | undefined) {
    const guildid = game.getGuild();
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
        await game.closeMessage(players, p => message(game, players, ctx, p), i, false);
        return true;
    } else {
        await game.updateMessage(players, p => message(game, players, ctx, p), i);
        return false;
    }
}

