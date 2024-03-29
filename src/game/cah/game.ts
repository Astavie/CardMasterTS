import { fillBlanks } from '../../util/card';
import { Logic, Transformer } from '../logic';
import { Card, CardRoundContext, countBlanks, GameContext, getBlackCard, getWhiteCard, randoId, realizeBlackCard, realizeWhiteCard } from './cah';

export const prepareRound: Transformer<boolean, boolean, GameContext> = (game, players, ctx, resume) => {
    if (!resume) {
        return false;
    }

    // Check if someone won
    if (Object.values(ctx.ctx.points).some(points => points >= ctx.ctx.maxPoints)) {
        return false;
    }   

    // Set czar
    ctx.ctx.czar += 1;
    if (ctx.ctx.czar >= players.length) ctx.ctx.czar = 0;

    // Get black card
    const card = ctx.ctx.blackDeck.pop();
    if (!card) {
        game.send(players, { embeds: [{
            description: '**The game has ended because the black deck ran out of cards.**'
        }]});
        return false;
    }

    ctx.ctx.prompt = realizeBlackCard(game, card, players);
    const blanks = countBlanks(game, ctx.ctx.prompt);

    // Remove played cards
    if (!ctx.ctx.quiplash) {
        for (const player of Object.keys(ctx.ctx.playing)) {
            const playing = ctx.ctx.playing[player];
            const cards = ctx.ctx.hand[player];
            const hand: Card[] = [];
            for (let i = 0; i < ctx.ctx.handCards; i++) {
                if (playing === 'double' || !playing.includes(i)) {
                    hand.push(cards[i]);
                }
            }
            if (ctx.ctx.doubleornothing) {
                if (playing !== 'double') {
                    ctx.ctx.doubleornothing[player] = {
                        cards: playing.map(i => (ctx.ctx as CardRoundContext).hand[player][i!]),
                        amount: 0,
                    };
                } else if (player === ctx.ctx.lastWinner) {
                    ctx.ctx.doubleornothing[player].amount += 1;
                } else {
                    ctx.ctx.doubleornothing[player].amount = 0;
                }
            }
            ctx.ctx.hand[player] = hand;
        }
    }

    // Give white cards
    ctx.ctx.playing = {};
    ctx.ctx.result = {};
    const fullPrompt = fillBlanks(getBlackCard(game, ctx.ctx.prompt), countBlanks(game, ctx.ctx.prompt), []);

    if (!ctx.ctx.quiplash) {
        for (const player of players) {
            const hand = ctx.ctx.hand[player.id] ?? [];

            while (hand.length < ctx.ctx.handCards) {
                const card = ctx.ctx.whiteDeck.pop();
                if (!card) {
                    game.send(players, { embeds: [{
                        description: '**The game has ended because the white deck ran out of cards.**'
                    }]})
                    return false;
                } else {
                    hand.push(realizeWhiteCard(game, card, players));
                }
            }

            ctx.ctx.hand[player.id] = hand;
            if (player !== players[ctx.ctx.czar]) {
                ctx.ctx.playing[player.id] = [];
                ctx.ctx.result[player.id] = fullPrompt;
            }
        }
    } else {
        for (const player of players) {
            if (player !== players[ctx.ctx.czar]) {
                ctx.ctx.playing[player.id] = null;
                ctx.ctx.result[player.id] = fullPrompt;
            }
        }
    }

    // Set rando's cards
    if (randoId in ctx.ctx.points && !(randoId in ctx.ctx.playing)) {
        if (!ctx.ctx.quiplash && ctx.ctx.doubleornothing) {
            const chance = ctx.ctx.lastWinner === randoId ? 0.33 : 0.05;
            if (Math.random() < chance) {
                ctx.ctx.playing[randoId] = 'double';

                ctx.idx = 0;
                return true;
            }
        }

        let randoPlaying: Card[] = [];
        let randoResult: string = fillBlanks(getBlackCard(game, ctx.ctx.prompt), blanks, []);
        while (randoResult.includes('\\_')) {
            const card = ctx.ctx.whiteDeck.pop();
            if (!card) {
                game.send(players, { embeds: [{
                    description: '**The game has ended because the white deck ran out of cards.**'
                }]})
                return false;
            }

            randoPlaying.push(realizeWhiteCard(game, card, players));
            randoResult = fillBlanks(getBlackCard(game, ctx.ctx.prompt), blanks, randoPlaying.map(c => getWhiteCard(game, c)));
        }

        if (ctx.ctx.quiplash) {
            ctx.ctx.playing[randoId] = randoPlaying.map(c => getWhiteCard(game, c));
            ctx.ctx.result[randoId] = randoResult;
        } else {
            ctx.ctx.hand[randoId] = randoPlaying;
            ctx.ctx.playing[randoId] = [...Array(blanks).keys()];
            ctx.ctx.result[randoId] = randoResult;
        }
    }

    ctx.idx = 0;
    return true;
}

export const joinLeaveLogic: Logic<boolean, GameContext> = function* (game, players, ctx) {
    while (true) {
        const event = yield;
        if (event.type !== 'interaction') continue;

        const i = event.interaction;
        if (i.customId === '_join') {
            // check if already joined
            if (players.indexOf(i.user) !== -1) {
                i.reply({
                    content: 'You have already joined!',
                    ephemeral: true
                });
                continue;
            }

            // check if enough white cards left
            if (!ctx.ctx.quiplash && ctx.idx === 0 && ctx.ctx.whiteDeck.length < ctx.ctx.handCards) {
                i.reply({
                    content: 'There are not enough cards left for you to join!',
                    ephemeral: true
                });
                continue;
            }

            // add player
            ctx.ctx.points[i.user.id] = 0;

            if (!ctx.ctx.quiplash && ctx.idx === 0) {
                const hand: Card[] = [];
                while (hand.length < ctx.ctx.handCards) {
                    const card = ctx.ctx.whiteDeck.pop()!;
                    hand.push(realizeWhiteCard(game, card, players));
                }

                ctx.ctx.hand[i.user.id] = hand;
                ctx.ctx.playing[i.user.id] = [];
                ctx.ctx.result[i.user.id] = getBlackCard(game, ctx.ctx.prompt);
            }

            game.addPlayer(i.user);
        } else if (i.customId === '_leave') {
            // check if not in game
            const index = players.indexOf(i.user);
            if (index === -1) {
                i.reply({ content: 'You have not even joined!', ephemeral: true });
                continue;
            }

            // check if this ends the game
            if (players.length === 2) {
                game.closeMessage(players, undefined, i);
                game.send(players, { embeds: [{
                    description: '**The game has ended because there were not enough players left.**'
                }]})
                return false;
            }
            
            // put player cards back
            if (!ctx.ctx.quiplash) {
                ctx.ctx.whiteDeck.push(...ctx.ctx.hand[i.user.id]);
            }

            // remove player
            game.removePlayer(i.user);
            delete ctx.ctx.points[i.user.id];
            delete ctx.ctx.playing[i.user.id];
            delete ctx.ctx.result[i.user.id];
            if (!ctx.ctx.quiplash) delete ctx.ctx.hand[i.user.id];
            const sindex = ctx.ctx.shuffle.indexOf(i.user.id);
            if (sindex !== -1) ctx.ctx.shuffle.splice(sindex, 1);

            // update czar
            if (ctx.ctx.czar === index) {
                ctx.ctx.czar -= 1;
                game.send(players, { embeds: [{
                    description: '**The round has been skipped because the Card Czar left the game.**'
                }]});
                game.closeMessage([...players, i.user], undefined, i);
                return true;
            } else {
                if (ctx.ctx.czar > index) {
                    ctx.ctx.czar -= 1;
                }
                game.closeMessage([i.user], undefined, i, true);
            }
        }
    }
};

export const gameResult: Transformer<void, void, GameContext> = (game, players, ctx) => {
    game.closeLobby();

    let winner = "";
    let maxPoints = 0;
    for (const [player, points] of Object.entries(ctx.ctx.points)) {
        if (points > maxPoints) {
            maxPoints = points;
            winner = player;
        }
    }

    if (maxPoints > 0) {
        if (winner === randoId) {
            game.send(players, { embeds: [{ fields: [{
                name: 'We have a winner!',
                value: `\`Rando Cardrissian\` won with ${maxPoints} ${maxPoints === 1 ? 'point' : 'points'}. All players should go home in a state of everlasting shame.`,
            }]}]})
        } else {
            game.send(players, { embeds: [{ fields: [{
                name: 'We have a winner!',
                value: `<@${winner}> won with ${maxPoints} ${maxPoints === 1 ? 'point' : 'points'}.`,
            }]}]});
        }
    } else {
        game.send(players, { embeds: [{
            description: '**No winner could be declared.**'
        }]});
    }
};

