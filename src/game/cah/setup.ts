import { Message } from "discord.js";
import { GameInstance, shuffle } from "../game";
import { CAH, CAHContext, CAHState, getPlayerList, packs, randoId } from "./cah";
import { setupHAND } from "./hand";

export function setup(game: GameInstance<CAHContext, CAHState>) {
    const packsPicked = packs.map((_p, i) => i === 0);

    game.activeMessage.message = () => ({
        embeds: [{
            color: CAH.color,
            title: CAH.name,
            fields: [{
                name: "Players",
                value: getPlayerList(game.players, game.context.flags[0])
            }]
        }]
    });

    game.join = (i, player) => {
        game.players.push(player);
        game.context.players[player.id] = {
            hand: [],
            playing: [],
            points: 0,
            hidden: false,
        };
        game.setupMessage.updateAll(i);
        return null;
    };
    game.leave = (i, player, index) => {
        game.players.splice(index, 1);
        delete game.context.players[player.id];
        game.setupMessage.updateAll(i);
        return null;
    };
    game.minPlayers = () => 2;
    game.maxPlayers = () => 20;
    
    game.addFlagsInput("Packs", packs.map(p => p.name), packsPicked);
    game.addFlagsInput("Rules", ["Rando Cardrissian", "Quiplash Mode"], game.context.flags);
    game.addNumberInput("Points", 1, 8, Number.MAX_SAFE_INTEGER, value => {game.context.maxPoints = value; return null;});
    game.addNumberInput("Cards", 5, 10, 20, value => {game.context.handCards = value; return null;});
    game.setSetupMessage(i => {
        if (!i.message) return null;

        // START
        game.context.whiteDeck = [];
        game.context.blackDeck = [];

        let widx = 0;
        let bidx = 0;

        for (let i = 0; i < packs.length; i++) {
            if (packsPicked[i]) {
                game.context.packs.push(i);
                for (const _ of packs[i].cards.white) game.context.whiteDeck.push(widx++);
                for (const _ of packs[i].cards.black) game.context.blackDeck.push(bidx++);
            }
        }

        if (game.context.blackDeck.length === 0) {
            i.reply({ ephemeral: true, content: "There are no black cards in the selected packs." });
            return null;
        }

        if (game.context.whiteDeck.length < (game.context.flags[1] ? 0 : game.players.length * game.context.handCards) + (game.context.flags[0] ? 1 : 0)) {
            i.reply({ ephemeral: true, content: "There aren't enough white cards in the selected packs to give everyone a full hand." });
            return null;
        }

        shuffle(game.context.whiteDeck);
        shuffle(game.context.blackDeck);

        if (game.context.flags[0]) {
            game.context.players[randoId] = {
                hand: [],
                playing: [],
                points: 0,
                hidden: false,
            }
        }

        game.setupMessage.disableButtons = ["_join", "_leave"];
        game.setupMessage.updateAll(i);
        return game.startLobby(i.message as Message).then(() => setupHAND(game));
    });
}
