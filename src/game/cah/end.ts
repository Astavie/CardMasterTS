import { GameInstance } from "../game";
import { CAH, CAHContext, CAHState, randoId } from "./cah";

export function end(game: GameInstance<CAHContext, CAHState>) {
    if (Object.values(game.context.players).some(p => p.points > 0)) {
        let maxPoints = Object.values(game.context.players).sort((a, b) => b.points - a.points)[0].points;
        const players = Object.keys(game.context.players).filter(p => game.context.players[p].points === maxPoints);

        if (players.length === 1) {
            if (players[0] === randoId) {
                game.sendAll(() => ({ embeds: [{
                    color: CAH.color,
                    fields: [{
                        name: 'We have a winner!',
                        value: `\`Rando Cardrissian\` won with ${maxPoints} ${maxPoints === 1 ? "point" : "points"}. All players should go home in a state of everlasting shame.`
                    }]
                }]})).then(() => game.kill());
            } else {
                game.sendAll(() => ({ embeds: [{
                    color: CAH.color,
                    fields: [{
                        name: 'We have a winner!',
                        value: `<@${players[0]}> won with ${maxPoints} ${maxPoints === 1 ? "point" : "points"}.`
                    }]
                }]})).then(() => game.kill());
            }
        } else {
            game.sendAll(() => ({ embeds: [{
                color: CAH.color,
                fields: [{
                    name: "It's a tie!",
                    value: `Winners: ${players.map(p => p === randoId ? "`Rando Cardrissian`" : `<@${p}>`).join(", ")} won with ${maxPoints} ${maxPoints === 1 ? "point" : "points"}.`
                }]
            }]})).then(() => game.kill());
        }
    } else {
        game.sendAll(() => ({ embeds: [{
            color: CAH.color,
            description: "**No winner could be declared.**"
        }]})).then(() => game.kill());
    }
}
