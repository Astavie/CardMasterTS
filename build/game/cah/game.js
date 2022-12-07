"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.gameResultLogic = exports.joinLeaveLogic = exports.prepareRound = void 0;
const card_1 = require("../../util/card");
const cah_1 = require("./cah");
function prepareRound({ ctx, game, players }) {
    // Check if someone won
    if (Object.values(ctx.context.points).some(points => points >= ctx.context.maxPoints)) {
        return false;
    }
    // Chck if enough players
    if (players.length < 2) {
        game.send(players, { embeds: [{
                    description: '**The game has ended because there were not enough players left.**'
                }] });
        return false;
    }
    // Set czar
    ctx.context.czar += 1;
    if (ctx.context.czar >= players.length)
        ctx.context.czar = 0;
    // Get black card
    const card = ctx.context.blackDeck.pop();
    if (!card) {
        game.send(players, { embeds: [{
                    description: '**The game has ended because the black deck ran out of cards.**'
                }] });
        return false;
    }
    ctx.context.prompt = (0, cah_1.realizeBlackCard)(card, players);
    const blanks = (0, card_1.countBlanks)((0, cah_1.getBlackCard)(ctx.context.prompt));
    // Remove played cards
    if (!ctx.context.quiplash) {
        for (const player of Object.keys(ctx.context.playing)) {
            const playing = ctx.context.playing[player];
            const cards = ctx.context.hand[player];
            const hand = [];
            for (let i = 0; i < ctx.context.handCards; i++) {
                if (playing === 'double' || !playing.includes(i)) {
                    hand.push(cards[i]);
                }
            }
            if (ctx.context.doubleornothing) {
                if (playing !== 'double') {
                    ctx.context.doubleornothing[player] = {
                        cards: playing.map(i => ctx.context.hand[player][i]),
                        amount: 0,
                    };
                }
                else if (player === ctx.context.lastWinner) {
                    ctx.context.doubleornothing[player].amount += 1;
                }
                else {
                    ctx.context.doubleornothing[player].amount = 0;
                }
            }
            ctx.context.hand[player] = hand;
        }
    }
    // Give white cards
    ctx.context.playing = {};
    if (!ctx.context.quiplash) {
        for (const player of players) {
            const hand = ctx.context.hand[player.id] ?? [];
            while (hand.length < ctx.context.handCards) {
                const card = ctx.context.whiteDeck.pop();
                if (!card) {
                    game.send(players, { embeds: [{
                                description: '**The game has ended because the white deck ran out of cards.**'
                            }] });
                    return false;
                }
                else {
                    hand.push((0, cah_1.realizeWhiteCard)(card, players));
                }
            }
            ctx.context.hand[player.id] = hand;
            if (player !== players[ctx.context.czar])
                ctx.context.playing[player.id] = Array(blanks).fill(null);
        }
    }
    else {
        for (const player of players) {
            if (player !== players[ctx.context.czar])
                ctx.context.playing[player.id] = null;
        }
    }
    // Set rando's cards
    if (cah_1.randoId in ctx.context.points && !(cah_1.randoId in ctx.context.playing)) {
        if (!ctx.context.quiplash && ctx.context.doubleornothing) {
            const chance = ctx.context.lastWinner === cah_1.randoId ? 0.33 : 0.05;
            if (Math.random() < chance) {
                ctx.context.playing[cah_1.randoId] = 'double';
                ctx.state = 'hand';
                return true;
            }
        }
        const hand = [];
        while (hand.length < blanks) {
            const card = ctx.context.whiteDeck.pop();
            if (!card) {
                game.send(players, { embeds: [{
                            description: '**The game has ended because the white deck ran out of cards.**'
                        }] });
                return false;
            }
            else {
                hand.push((0, cah_1.realizeWhiteCard)(card, players));
            }
        }
        if (ctx.context.quiplash) {
            ctx.context.playing[cah_1.randoId] = hand.map(cah_1.getWhiteCard);
        }
        else {
            ctx.context.hand[cah_1.randoId] = hand;
            ctx.context.playing[cah_1.randoId] = [...Array(blanks).keys()];
        }
    }
    ctx.state = 'hand';
    return true;
}
exports.prepareRound = prepareRound;
exports.joinLeaveLogic = {
    onEvent({ ctx, game, players }, event, resolve) {
        if (event.type !== 'interaction')
            return;
        const i = event.interaction;
        if (i.customId === '_join') {
            // check if already joined
            if (players.indexOf(i.user) !== -1) {
                i.reply({
                    content: 'You have already joined!',
                    ephemeral: true
                });
                return;
            }
            // check if enough white cards left
            if (!ctx.context.quiplash && ctx.state === 'hand' && ctx.context.whiteDeck.length < ctx.context.handCards) {
                i.reply({
                    content: 'There are not enough cards left for you to join!',
                    ephemeral: true
                });
                return;
            }
            // add player
            game.addPlayer(i.user);
            ctx.context.points[i.user.id] = 0;
            if (!ctx.context.quiplash && ctx.state === 'hand') {
                const hand = [];
                while (hand.length < ctx.context.handCards) {
                    const card = ctx.context.whiteDeck.pop();
                    hand.push((0, cah_1.realizeWhiteCard)(card, players));
                }
                const blanks = (0, card_1.countBlanks)((0, cah_1.getBlackCard)(ctx.context.prompt));
                ctx.context.hand[i.user.id] = hand;
                ctx.context.playing[i.user.id] = Array(blanks).fill(null);
            }
        }
        else if (i.customId === '_leave') {
            // check if not in game
            const index = players.indexOf(i.user);
            if (index === -1) {
                i.reply({ content: 'You have not even joined!', ephemeral: true });
                return;
            }
            // put player cards back
            if (!ctx.context.quiplash) {
                ctx.context.whiteDeck.push(...ctx.context.hand[i.user.id]);
            }
            // remove player
            game.removePlayer(i.user);
            delete ctx.context.points[i.user.id];
            delete ctx.context.playing[i.user.id];
            if (!ctx.context.quiplash)
                delete ctx.context.hand[i.user.id];
            const sindex = ctx.context.shuffle.indexOf(i.user.id);
            if (sindex !== -1)
                ctx.context.shuffle.splice(sindex, 1);
            // check if this ends the game
            if (players.length < 2) {
                resolve();
                return;
            }
            // update czar
            if (ctx.context.czar === index) {
                ctx.context.czar -= 1;
                game.send(players, { embeds: [{
                            description: '**The round has been skipped because the Card Czar left the game.**'
                        }] });
                game.closeMessage(players).then(resolve);
                return;
            }
            else {
                if (ctx.context.czar > index) {
                    ctx.context.czar -= 1;
                }
                game.closeMessage([i.user], undefined, i, true);
            }
        }
    },
};
exports.gameResultLogic = {
    onEvent({ game }, event, resolve) {
        if (event.type === 'interaction' && event.interaction.customId === '_close') {
            game.closeLobby(undefined, event.interaction);
            resolve();
        }
    },
    onExit({ ctx, game, players }) {
        game.closeLobby();
        let winner = "";
        let maxPoints = 0;
        for (const [player, points] of Object.entries(ctx.context.points)) {
            if (points > maxPoints) {
                maxPoints = points;
                winner = player;
            }
        }
        if (maxPoints > 0) {
            if (winner === cah_1.randoId) {
                game.send(players, { embeds: [{ fields: [{
                                    name: 'We have a winner!',
                                    value: `\`Rando Cardrissian\` won with ${maxPoints} ${maxPoints === 1 ? 'point' : 'points'}. All players should go home in a state of everlasting shame.`,
                                }] }] });
            }
            else {
                game.send(players, { embeds: [{ fields: [{
                                    name: 'We have a winner!',
                                    value: `<@${winner}> won with ${maxPoints} ${maxPoints === 1 ? 'point' : 'points'}.`,
                                }] }] });
            }
        }
        else {
            game.send(players, { embeds: [{
                        description: '**No winner could be declared.**'
                    }] });
        }
    },
};
