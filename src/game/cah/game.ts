import { countBlanks } from '../../util/card';
import { Game, Logic } from '../logic';
import { Card, CardRoundContext, GameContext, getBlackCard, getWhiteCard, randoId, realizeBlackCard, realizeWhiteCard } from './cah';

export function prepareRound(ctx: GameContext, game: Game): null | void {
    // Check if someone won
    if (Object.values(ctx.context.points).some(points => points >= ctx.context.maxPoints)) {
        return;
    }   

    // Chck if enough players
    if (game.players.length < 2) {
        game.sendAll({ embeds: [{
            description: '**The game has ended because there were not enough players left.**'
        }]})
        return;
    }

    // Set czar
    ctx.context.czar += 1;
    if (ctx.context.czar >= game.players.length) ctx.context.czar = 0;

    // Get black card
    const card = ctx.context.blackDeck.pop();
    if (!card) {
        game.sendAll({ embeds: [{
            description: '**The game has ended because the black deck ran out of cards.**'
        }]});
        return;
    }

    ctx.context.prompt = realizeBlackCard(card, game.players);
    const blanks = countBlanks(getBlackCard(ctx.context.prompt));

    // Remove played cards
    if (!ctx.context.quiplash) {
        for (const player of Object.keys(ctx.context.playing)) {
            const playing = ctx.context.playing[player];
            const cards = ctx.context.hand[player];
            const hand: Card[] = [];
            for (let i = 0; i < ctx.context.handCards; i++) {
                if (playing === 'double' || !playing.includes(i)) {
                    hand.push(cards[i]);
                }
            }
            if (ctx.context.doubleornothing) {
                if (playing !== 'double') {
                    ctx.context.doubleornothing[player] = {
                        cards: playing.map(i => (ctx.context as CardRoundContext).hand[player][i!]),
                        amount: 0,
                    };
                } else if (player === ctx.context.lastWinner) {
                    ctx.context.doubleornothing[player].amount += 1;
                } else {
                    ctx.context.doubleornothing[player].amount = 0;
                }
            }
            ctx.context.hand[player] = hand;
        }
    }

    // Give white cards
    ctx.context.playing = {};

    if (!ctx.context.quiplash) {
        for (const player of game.players) {
            const hand = ctx.context.hand[player.id] ?? [];

            while (hand.length < ctx.context.handCards) {
                const card = ctx.context.whiteDeck.pop();
                if (!card) {
                    game.sendAll({ embeds: [{
                        description: '**The game has ended because the white deck ran out of cards.**'
                    }]})
                    return;
                } else {
                    hand.push(realizeWhiteCard(card, game.players));
                }
            }

            ctx.context.hand[player.id] = hand;
            if (player !== game.players[ctx.context.czar]) ctx.context.playing[player.id] = Array(blanks).fill(null);
        }
    } else {
        for (const player of game.players) {
            if (player !== game.players[ctx.context.czar]) ctx.context.playing[player.id] = null;
        }
    }

    // Set rando's cards
    if (randoId in ctx.context.points && !(randoId in ctx.context.playing)) {
        if (!ctx.context.quiplash && ctx.context.doubleornothing) {
            const chance = ctx.context.lastWinner === randoId ? 0.33 : 0.05;
            if (Math.random() < chance) {
                ctx.context.playing[randoId] = 'double';

                // null = repeat
                ctx.state = 'hand';
                return null;
            }
        }

        const hand: Card[] = [];
        while (hand.length < blanks) {
            const card = ctx.context.whiteDeck.pop();
            if (!card) {
                game.sendAll({ embeds: [{
                    description: '**The game has ended because the white deck ran out of cards.**'
                }]})
                return;
            } else {
                hand.push(realizeWhiteCard(card, game.players));
            }
        }

        if (ctx.context.quiplash) {
            ctx.context.playing[randoId] = hand.map(getWhiteCard);
        } else {
            ctx.context.hand[randoId] = hand;
            ctx.context.playing[randoId] = [...Array(blanks).keys()];
        }
    }

    // null = repeat
    ctx.state = 'hand';
    return null;
}

export const joinLeaveLogic: Logic<void, GameContext> = {
    onInteraction(ctx, game, resolve, i) {
        if (i.customId === '_join') {
            // check if already joined
            if (game.players.indexOf(i.user) !== -1) {
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
            game.players.push(i.user);
            ctx.context.points[i.user.id] = 0;

            if (!ctx.context.quiplash && ctx.state === 'hand') {
                const hand: Card[] = [];
                while (hand.length < ctx.context.handCards) {
                    const card = ctx.context.whiteDeck.pop()!;
                    hand.push(realizeWhiteCard(card, game.players));
                }

                const blanks = countBlanks(getBlackCard(ctx.context.prompt));
                ctx.context.hand[i.user.id] = hand;
                ctx.context.playing[i.user.id] = Array(blanks).fill(null);
            }
        } else if (i.customId === '_leave') {
            // check if not in game
            const index = game.players.indexOf(i.user);
            if (index === -1) {
                i.reply({ content: 'You have not even joined!', ephemeral: true });
                return;
            }

            // put player cards back
            if (!ctx.context.quiplash) {
                ctx.context.whiteDeck.push(...ctx.context.hand[i.user.id]);
            }

            // remove player
            game.players.splice(index, 1);
            delete ctx.context.points[i.user.id];
            delete ctx.context.playing[i.user.id];
            if (!ctx.context.quiplash) delete ctx.context.hand[i.user.id];
            const sindex = ctx.context.shuffle.indexOf(i.user.id);
            if (sindex !== -1) ctx.context.shuffle.splice(sindex, 1);

            // check if this ends the game
            if (game.players.length < 2) {
                resolve();
                return;
            }

            // update czar
            if (ctx.context.czar === index) {
                ctx.context.czar -= 1;
                game.sendAll({ embeds: [{
                    description: '**The round has been skipped because the Card Czar left the game.**'
                }]});
                game.closeMessage().then(resolve);
                return;
            } else {
                if (ctx.context.czar > index) {
                    ctx.context.czar -= 1;
                }
                game.closeMessage(undefined, i, player => player === i.user);
            }
        }
    },
};

export const gameResultLogic: Logic<void, GameContext> = {
    onExit(ctx, game) {
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
            if (winner === randoId) {
                game.sendAll({ embeds: [{ fields: [{
                    name: 'We have a winner!',
                    value: `\`Rando Cardrissian\` won with ${maxPoints} ${maxPoints === 1 ? 'point' : 'points'}. All players should go home in a state of everlasting shame.`,
                }]}]})
            } else {
                game.sendAll({ embeds: [{ fields: [{
                    name: 'We have a winner!',
                    value: `<@${winner}> won with ${maxPoints} ${maxPoints === 1 ? 'point' : 'points'}.`,
                }]}]});
            }
        } else {
            game.sendAll({ embeds: [{
                description: '**No winner could be declared.**'
            }]});
        }
    },
};

