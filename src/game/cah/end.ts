import { GameInstance, MessageController } from "../game";
import { CAHContext, CAHStates, getPointsList, randoId } from "./cah";

export async function end(game: GameInstance<CAHContext, CAHStates>): Promise<CAHStates | void> {
    if (Object.values(game.context.players).some(p => p.points > 0)) {
        let maxPoints = Object.values(game.context.players).sort((a, b) => b.points - a.points)[0].points;
        const players = Object.keys(game.context.players).filter(p => game.context.players[p].points === maxPoints);

        if (players.length === 1) {
            if (players[0] === randoId) {
                new MessageController(game, () => {
                    return { embeds: [{
                        color: "#000000",
                        fields: [{
                            name: 'We have a winner!',
                            value: `\`Rando Cardrissian\` won with ${maxPoints} ${maxPoints === 1 ? "point" : "points"}. All players should go home in a state of everlasting shame.`
                        }, {
                            name: 'Points',
                            value: getPointsList(game.players, game.context.rando, game.context.players, game.context.maxPoints)
                        }]
                    }]};
                }).sendAll();
            } else {
                new MessageController(game, () => {
                    return { embeds: [{
                        color: "#000000",
                        fields: [{
                            name: 'We have a winner!',
                            value: `<@${players[0]}> won with ${maxPoints} ${maxPoints === 1 ? "point" : "points"}.`
                        }, {
                            name: 'Points',
                            value: getPointsList(game.players, game.context.rando, game.context.players, game.context.maxPoints)
                        }]
                    }]};
                }).sendAll();
            }
        } else {
            new MessageController(game, () => {
                return { embeds: [{
                    color: "#000000",
                    fields: [{
                        name: "It's a tie!",
                        value: `Winners: ${players.map(p => p === randoId ? "`Rando Cardrissian`" : `<@${p}>`)} won with ${maxPoints} ${maxPoints === 1 ? "point" : "points"}.`
                    }, {
                        name: 'Points',
                        value: getPointsList(game.players, game.context.rando, game.context.players, game.context.maxPoints)
                    }]
                }]};
            }).sendAll();
        }
    } else {
        new MessageController(game, () => {
            return { embeds: [{
                color: "#000000",
                description: "**No winner could be declared.**"
            }]};
        }).sendAll();
    }
}
