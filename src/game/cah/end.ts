import { MessageController } from "../../util/message";
import { GameInstance } from "../game";
import { CAH, CAHState, randoId } from "./cah";

export function end(game: GameInstance, state: CAHState) {
    if (Object.values(state.players).some(p => p.points > 0)) {
        let maxPoints = Object.values(state.players).sort((a, b) => b.points - a.points)[0].points;
        const players = Object.keys(state.players).filter(p => state.players[p].points === maxPoints);

        if (players.length === 1) {
            if (players[0] === randoId) {
                return game.sendAll(new MessageController(() => ({ embeds: [{
                    color: CAH.color,
                    fields: [{
                        name: 'We have a winner!',
                        value: `\`Rando Cardrissian\` won with ${maxPoints} ${maxPoints === 1 ? "point" : "points"}. All players should go home in a state of everlasting shame.`
                    }]
                }]})));
            } else {
                return game.sendAll(new MessageController(() => ({ embeds: [{
                    color: CAH.color,
                    fields: [{
                        name: 'We have a winner!',
                        value: `<@${players[0]}> won with ${maxPoints} ${maxPoints === 1 ? "point" : "points"}.`
                    }]
                }]})));
            }
        } else {
            return game.sendAll(new MessageController(() => ({ embeds: [{
                color: CAH.color,
                fields: [{
                    name: "It's a tie!",
                    value: `Winners: ${players.map(p => p === randoId ? "`Rando Cardrissian`" : `<@${p}>`)} won with ${maxPoints} ${maxPoints === 1 ? "point" : "points"}.`
                }]
            }]})));
        }
    } else {
        return game.sendAll(new MessageController(() => ({ embeds: [{
            color: CAH.color,
            description: "**No winner could be declared.**"
        }]})));
    }
}
