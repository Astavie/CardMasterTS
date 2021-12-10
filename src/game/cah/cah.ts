import { ButtonInteraction, Snowflake, User } from "discord.js";
import { Game, GameInstance, MessageController, shuffle } from "../game";
import { setup } from "./setup";
import { basePack, fullPack } from "./packs/cahstandard";
import { play } from "./play";
import { read } from "./read";
import { end } from "./end";
import fs from "fs";

export type Card = string;

export type Pack = {
    name: string
    cards: {
        white: Card[]
        black: Card[]
    }
}

// Global packs
export const packs: Pack[] = [
    { name: "CAH Base", cards: basePack },
    { name: "CAH Full", cards: fullPack },
];

// Packs inside .gitignore
function conditionalRequire(name: string): any {
    try {
        return require(name);
    } catch (_) {}
    return undefined;
}

const p = conditionalRequire("./packs/eppgroep")
if (p) {
    packs.push({ name: "EPPgroep", cards: p.eppgroep });
    packs.push({ name: "EPPgroep", cards: p.eppgroep });
}

export function getPlayerList(players: User[], rando: boolean) {
    const ids = players.map(p => "<@" + p.id + ">");
    if (rando) {
        ids.unshift("`Rando Cardrissian`");
    }
    return ids.length > 0 ? ids.join("\n") : "*None*";
}

export function isCzar(game: GameInstance<CAHContext, CAHStates>, player: User) {
    const i = game.players.indexOf(player);
    return ((!game.context.versus && game.context.czar === i) || (game.context.versus && !game.context.pairs[0].includes(i)));
}

export function addPlayer(game: GameInstance<CAHContext, CAHStates>, i: ButtonInteraction, m: MessageController) {
    // Check if can join
    if (game.players.indexOf(i.user) >= 0) {
        i.reply({ content: "You've already joined!", ephemeral: true });
        return false;
    }

    if (!game.context.quiplash && game.context.whiteDeck.length < game.context.handCards) {
        i.reply({ content: "There aren't enough white cards left for you to join.", ephemeral: true });
        return false;
    }

    // Join
    game.players.push(i.user);
    game.context.players[i.user.id] = {
        hand: [],
        playing: [],
        points: 0
    }

    // Versus mode ?

    // Give cards
    if (!game.context.quiplash) {
        for (let j = 0; j < game.context.handCards; j++) {
            game.context.players[i.user.id].hand.push(realizeCard(game.context.whiteDeck.pop(), game.players));
        }
    }

    // Display
    m.updateAll(i);
    return true;
}

export async function removePlayer(game: GameInstance<CAHContext, CAHStates>, i: ButtonInteraction, m: MessageController, ended: () => void) {
    // Check if can leave
    if (game.players.indexOf(i.user) === -1) {
        i.reply({ content: "You haven't even joined!", ephemeral: true });
        return;
    }

    // Remove message handler
    delete game.message[i.user.dmChannel.id];

    // Instert player hand back into deck
    for (const card of game.context.players[i.user.id].hand) game.context.whiteDeck.push(card);
    shuffle(game.context.whiteDeck);

    // Remove from pairs
    // game.context.pairs = game.context.pairs.filter((p, i) => i === 0 || !p.includes(game.players.length - 1));

    // Check if we can still continue playing
    if ((game.players.length <= 3 && !game.context.rando && game.context.versus) || (game.players.length <= 2)) {
        ended();
        m.update(i);

        // Leave
        game.players.splice(game.players.indexOf(i.user), 1);
        delete game.context.players[i.user.id];

        await new MessageController(game, () => {
            return {
                embeds: [{
                    color: "#000000",
                    description: "**The game has ended because there are not enough players left.**"
                }]
            }
        }).sendAll();
        return "end";
    }

    // Check if we need to skip a round
    if (!game.context.versus && isCzar(game, i.user)) {
        ended();
        m.update(i);

        // Leave
        game.players.splice(game.players.indexOf(i.user), 1);
        delete game.context.players[i.user.id];

        await new MessageController(game, () => {
            return {
                embeds: [{
                    color: "#000000",
                    description: "**The round has been skipped because the Card Czar left the game.**"
                }]
            }
        }).sendAll();
        game.context.czar -= 1;
        return "play";
    }

    // if (game.context.versus && !isCzar(game, i.user)) {
    //     ended();
    //     m.update(i);

    //     // Leave
    //     game.players.splice(game.players.indexOf(i.user), 1);
    //     delete game.context.players[i.user.id];

    //     await new MessageController(game, () => {
    //         return {
    //             embeds: [{
    //                 color: "#000000",
    //                 description: "**The round has been skipped because a paired player left the game.**"
    //             }]
    //         }
    //     }).sendAll();
    //     return "play";
    // }

    // Leave
    const index = game.players.indexOf(i.user);
    game.players.splice(index, 1);
    delete game.context.players[i.user.id];

    if (index < game.context.czar) {
        game.context.czar -= 1;
    }

    const sindex = game.context.shuffle.indexOf(i.user.id);
    if (sindex >= 0) game.context.shuffle.splice(sindex, 1);

    // Display
    m.updateAll(i);
}

export const randoId = "rando";

export function getPointsList(players: User[], rando: boolean, points: {[key: string]: { points: number }}, maxPoints: number) {
    const ids = players.map(p => "`" + points[p.id].points + "` <@" + p.id + ">");
    if (rando) {
        ids.unshift("`" + points[randoId].points + "` `Rando Cardrissian`");
    }
    return ids.join("\n") + (maxPoints ? "\n`" + maxPoints + "` points to win" : "");
}

export function getBlanks(prompt: string) {
    return prompt.match(/_/gi)?.length || 1;
}

export function realizeCard(card: string, players: User[]) {
    return card.replace("{}", "<@" + players[Math.floor(Math.random()*players.length)].id + ">");
}

const context = () => {
    return {
        players: {} as {[key: string]: {
            hand: Card[],
            playing: number[],
            points: number
        }},

        shuffle: [] as string[],

        rando: false,
        versus: false,
        quiplash: false,

        maxPoints: 8,
        handCards: 10,

        blackDeck: [] as Card[],
        whiteDeck: [] as Card[],

        prompt: undefined as Card | undefined,
        czar: -1,

        pairs: [] as [number, number][],
        round: 0,
        rounds: 2,

        picked: [] as Snowflake[][],

        playMessage: undefined as MessageController
    };
}

export type CAHContext = ReturnType<typeof context>;
export type CAHStates = "play" | "read" | "end";

export const CAH: Game<CAHContext, CAHStates> = {

    name: "Crappy Ableist Humor",
    context: context,

    onStart: setup,
    states: {
        "play": play,
        "read": read,
        "end": end
    }

};
