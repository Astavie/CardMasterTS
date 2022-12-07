"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handLogic = void 0;
const card_1 = require("../../util/card");
const message_1 = require("../../util/message");
const logic_1 = require("../logic");
const cah_1 = require("./cah");
function message({ ctx, players }, player) {
    let prompt = (0, cah_1.getBlackCard)(ctx.prompt);
    const blanks = (0, card_1.countBlanks)(prompt);
    const fields = [];
    const components = [];
    const allPlaying = Object.entries(ctx.playing).filter(([k, _v]) => k !== cah_1.randoId).map(([_k, v]) => v);
    const playedCards = ctx.quiplash ? allPlaying.filter(p => p !== null).length : allPlaying.filter(p => !p.includes(null)).length;
    const totalPlayers = players.length - 1;
    if (player && player !== players[ctx.czar]) {
        if (!ctx.quiplash) {
            const playing = ctx.playing[player.id];
            const hand = ctx.hand[player.id];
            let cards = [];
            if (playing === 'double') {
                cards = ctx.doubleornothing[player.id].cards.map(cah_1.getWhiteCard);
                const missing = blanks - cards.length;
                for (let i = 0; i < missing; i++) {
                    cards.push(cards[i]);
                }
            }
            else {
                cards = playing.map(i => i !== null ? (0, cah_1.getWhiteCard)(hand[i]) : null);
            }
            prompt = (0, card_1.fillBlanks)(prompt, cards);
            fields.push({
                name: 'Hand',
                value: hand.map((c, i) => `\`${(i + 1).toString().padStart(2)}.\` ${(0, cah_1.getWhiteCard)(c)}`).join('\n'),
            });
            if (ctx.doubleornothing && player.id in ctx.doubleornothing)
                fields.push({
                    name: 'Last cards played',
                    value: ctx.doubleornothing[player.id].cards.map(cah_1.getWhiteCard).join('\n'),
                });
            const playingStyle = (playing !== 'double' && !playing.includes(null)) ? 'SUCCESS' : 'PRIMARY';
            const disableUnplayed = (playing !== 'double' && !playing.includes(null)) && blanks > 1;
            components.push(...(0, message_1.createButtonGrid)(ctx.handCards, i => ({
                style: playing !== 'double' && playing.includes(i) ? playingStyle : 'SECONDARY',
                label: (i + 1).toString(),
                customId: `hand_${i}`,
                disabled: disableUnplayed && !playing.includes(i),
            })));
        }
        else {
            const playing = ctx.playing[player.id];
            if (playing !== 'random' && playing !== null)
                prompt = (0, card_1.fillBlanks)(prompt, playing);
            components.push({
                type: 'ACTION_ROW',
                components: [{
                        type: 'BUTTON',
                        style: playing === 'random' || playing === null ? 'SECONDARY' : 'SUCCESS',
                        label: 'Fill',
                        customId: 'fill',
                        disabled: playing === 'random',
                    }, {
                        type: 'BUTTON',
                        style: playing === 'random' ? 'SUCCESS' : 'SECONDARY',
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
        const buttons = [{
                type: 'BUTTON',
                customId: '_leave',
                style: 'DANGER',
                label: 'Leave',
            }];
        if (player !== players[ctx.czar] && !ctx.quiplash && ctx.doubleornothing && player.id in ctx.doubleornothing) {
            buttons.unshift({
                type: 'BUTTON',
                customId: 'double',
                style: ctx.playing[player.id] === 'double' ? 'SUCCESS' : 'SECONDARY',
                label: 'Double or nothing' + '!'.repeat(ctx.doubleornothing[player.id].amount),
            });
        }
        components.push({
            type: 'ACTION_ROW',
            components: buttons,
        });
    }
    return {
        embeds: [{ fields: fields }],
        components,
        forceList: true,
    };
}
exports.handLogic = (0, logic_1.singleResolve)({
    async onExit({ game, players }) {
        // do not close spectator message
        await game.closeMessage(players, undefined, undefined, false);
    },
    onEvent(full, event, resolve) {
        const { ctx, players, game } = full;
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
                            const prompt = (0, cah_1.getBlackCard)(ctx.prompt);
                            const blanks = (0, card_1.countBlanks)(prompt);
                            ctx.playing[i.user.id] = Array(blanks).fill(null);
                            game.updateMessage(players, p => message(full, p), i);
                        }
                        else {
                            ctx.playing[i.user.id] = 'double';
                            resolveWhenPlayersDone(full, i, resolve);
                        }
                    }
                    else if (i.customId.startsWith('hand_')) {
                        const prompt = (0, cah_1.getBlackCard)(ctx.prompt);
                        const blanks = (0, card_1.countBlanks)(prompt);
                        const hand = parseInt(i.customId.substring(5));
                        const player = i.user;
                        if (ctx.playing[i.user.id] === 'double') {
                            ctx.playing[i.user.id] = Array(blanks).fill(null);
                        }
                        const playing = ctx.playing[player.id];
                        const pindex = playing.indexOf(hand);
                        let uindex = playing.indexOf(null);
                        if (pindex === -1) {
                            if (uindex === -1) {
                                if (blanks === 1)
                                    uindex = 0;
                                else
                                    return;
                            }
                            playing[uindex] = hand;
                            if (playing.indexOf(null) === -1) {
                                resolveWhenPlayersDone(full, i, resolve);
                            }
                            else {
                                game.updateMessage([player], message(full, player), i, false);
                            }
                        }
                        else {
                            playing[pindex] = null;
                            if (uindex === -1) {
                                game.updateMessage(players, p => message(full, p), i);
                            }
                            else {
                                game.updateMessage([player], message(full, player), i, false);
                            }
                        }
                    }
                }
                else {
                    if (i.isButton()) {
                        if (i.customId === 'fill') {
                            (0, card_1.fillModal)((0, cah_1.getBlackCard)(ctx.prompt), i);
                        }
                        else if (i.customId === 'random') {
                            if (ctx.playing[i.user.id] === 'random') {
                                ctx.playing[i.user.id] = null;
                                game.updateMessage(players, p => message(full, p), i);
                            }
                            else {
                                const prompt = (0, cah_1.getBlackCard)(ctx.prompt);
                                const blanks = (0, card_1.countBlanks)(prompt);
                                const count = Object.values(ctx.playing).filter(p => p === 'random').length + 1;
                                if (count * blanks > ctx.whiteDeck.length) {
                                    i.reply({ content: 'There are not enough white cards left for this option!', ephemeral: true });
                                    return;
                                }
                                ctx.playing[i.user.id] = 'random';
                                resolveWhenPlayersDone(full, i, resolve);
                            }
                        }
                    }
                    else if (i.isModalSubmit() && i.customId === 'fill_modal') {
                        ctx.playing[i.user.id] = i.components.map(c => (0, card_1.escapeDiscord)(c.components[0].value));
                        resolveWhenPlayersDone(full, i, resolve);
                    }
                }
                break;
        }
    },
});
function allPlayersDone(ctx) {
    if (ctx.quiplash) {
        return Object.values(ctx.playing).every(p => p !== null);
    }
    else {
        return Object.values(ctx.playing).every(p => p === 'double' || !p.includes(null));
    }
}
function resolveWhenPlayersDone(full, i, resolve) {
    const { game, ctx, players } = full;
    if (allPlayersDone(ctx)) {
        // put random cards in
        if (ctx.quiplash) {
            const prompt = (0, cah_1.getBlackCard)(ctx.prompt);
            const blanks = (0, card_1.countBlanks)(prompt);
            for (const player of Object.keys(ctx.playing)) {
                if (ctx.playing[player] === 'random') {
                    const cards = [];
                    while (cards.length < blanks) {
                        cards.push((0, cah_1.getWhiteCard)((0, cah_1.realizeWhiteCard)(ctx.whiteDeck.pop(), players)));
                    }
                    ctx.playing[player] = cards;
                }
            }
        }
        // shuffle everyone
        ctx.shuffle = (0, card_1.shuffle)(Object.keys(ctx.playing));
        // next part!
        game.closeMessage(players, p => message(full, p), i, false).then(resolve);
    }
    else {
        game.updateMessage(players, p => message(full, p), i);
    }
}
