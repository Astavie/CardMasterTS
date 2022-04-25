import { BaseCommandInteraction, MessageComponentInteraction } from "discord.js";
import { MessageController } from "../../util/message";
import { GameInstance, shuffle } from "../game";
import { CAH, CAHState, getPlayerList, packs, randoId } from "./cah";

// Packs inside .gitignore
function conditionalRequire(name: string): any {
    try {
        return require(name);
    } catch (_) {}
    return undefined;
}

const eppgroep = conditionalRequire("./packs/eppgroep")?.eppgroep;

export function setup(game: GameInstance, state: CAHState, i: BaseCommandInteraction): Promise<void> {
    return new Promise<void>(resolve => {
        const internalPacks = [...packs];
        if (eppgroep && process.env.EPPGROEP && i.guildId === process.env.EPPGROEP) {
            internalPacks.push({ name: "EPPGroep", cards: eppgroep });
            internalPacks.push({ name: "EPPGroep", cards: eppgroep });
        }
    
        const packsPicked = internalPacks.map((_p, i) => i === 0);
    
        const msg = new MessageController(() => ({
            embeds: [{
                color: CAH.color,
                title: CAH.name,
                fields: [{
                    name: "Players",
                    value: getPlayerList(game.players, state.rando)
                }]
            }]
        }));

        game.join = (i, player) => {
            state.players[player.id] = {
                hand: [],
                playing: [],
                points: 0
            };
            if (msg.isMyInteraction(i)) {
                msg.updateAll(i as MessageComponentInteraction);
            } else {
                // TODO: Slash join
            }
        };
        game.leave = (i, player) => {
            delete state.players[player.id];
            if (msg.isMyInteraction(i)) {
                msg.updateAll(i as MessageComponentInteraction);
            } else {
                // TODO: Slash kick
            }
        };
        game.minPlayers = () => 2;
        game.maxPlayers = () => 20;
        
        game.addFlagsInput(msg, "Packs", internalPacks.map(p => p.name), packsPicked);
        game.addFlagsInput(msg, "Rules", ["Rando Cardrissian"], [false], (_, value) => state.rando = value);
        game.addNumberInput(msg, "Points", 1, 8, Number.MAX_SAFE_INTEGER + 1, value => state.maxPoints = value);
        game.addNumberInput(msg, "Cards", 5, 10, 20, value => state.handCards = value);
        game.setSetupMessage(msg,
            i => {
                // START
                state.whiteDeck = [];
                state.blackDeck = [];
        
                for (let i = 0; i < internalPacks.length; i++) {
                    if (packsPicked[i]) {
                        for (const card of internalPacks[i].cards.white) state.whiteDeck.push(card);
                        for (const card of internalPacks[i].cards.black) state.blackDeck.push(card);
                    }
                }
        
                if (state.blackDeck.length === 0) {
                    i.reply({ ephemeral: true, content: "There are no black cards in the selected packs." });
                    return;
                }
        
                if (state.whiteDeck.length < game.players.length * state.handCards + (state.rando ? 1 : 0)) {
                    i.reply({ ephemeral: true, content: "There aren't enough white cards in the selected packs to give everyone a full hand." });
                    return;
                }

                shuffle(state.whiteDeck);
                shuffle(state.blackDeck);

                if (state.rando) {
                    state.players[randoId] = {
                        hand: [],
                        playing: [],
                        points: 0
                    }
                }

                msg.endAll(i, false, "_join", "_leave");
                game.resetControls();
                game.startLobbies(msg).then(() => resolve());
            });
    
        msg.reply(i);
    });
}
