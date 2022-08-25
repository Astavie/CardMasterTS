import { ButtonInteraction, User, Snowflake } from "discord.js";
import { countBlanks, escapeDiscord, fillPlayers } from "../../util/card";
import { Game, GameInstance, shuffle } from "../game";
import { end } from "./end";
import { displayHAND, resumeHAND, setupHAND } from "./hand";
import { basePack, fullPack } from "./packs/cahstandard";
import { displayREAD, resumeREAD } from "./read";
import { setup } from "./setup";

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
    escapePack({ name: "CAH Base", cards: basePack }),
    escapePack({ name: "CAH Full", cards: fullPack }),
];

// Packs inside .gitignore
function conditionalRequire(name: string): any {
    try {
        return require(name);
    } catch (_) {}
    return undefined;
}

const eppgroep = conditionalRequire("./packs/eppgroep")?.eppgroep;

if (eppgroep) {
    const epack = escapePack({
        name: "EPPGroep",
        cards: eppgroep,
    });
    packs.push(epack);
    packs.push(epack);
}

function escapePack(p: Pack) {
    p.cards.white = p.cards.white.map(escapeDiscord);
    p.cards.black = p.cards.black.map(escapeDiscord);
    return p;
}

export function getPlayerList(players: User[], rando: boolean) {
    const ids = players.map(p => p.toString() as string);
    if (rando) {
        ids.unshift("`Rando Cardrissian`");
    }
    return ids.length > 0 ? ids.join("\n") : "*None*";
}

export function getPointsList(players: User[], rando: boolean, points: {[key: string]: { points: number }}, maxPoints: number) {
    const ids = players.map(p => "`" + points[p.id].points.toString().padStart(2) + "` " + p.toString());
    if (rando) {
        ids.unshift("`" + points[randoId].points.toString().padStart(2) + "` `Rando Cardrissian`");
    }
    return ids.join("\n") + (maxPoints ? "\n`" + maxPoints.toString().padStart(2) + "` points to win" : "");
}

export function addPlayer(i: ButtonInteraction, game: GameInstance<CAHContext, CAHState>, player: User): Promise<CAHState> | null {
    // Add player
    game.players.push(player);
    game.context.players[player.id] = {
        hand: [],
        playing: game.context.prompt ? Array(countBlanks(game.context.prompt)).fill(undefined) : [],
        points: 0,
        hidden: false,
    }

    const hand = game.context.players[player.id].hand;
    while (hand.length < game.context.handCards) {
        const card = getWhiteCard(game.context);
        if (!card) {
            game.activeMessage.endAll();
            game.setupMessage.updateAll(i);
            game.sendAll(() => ({
                embeds: [{
                    color: CAH.color,
                    description: "**The game has ended because there are not enough white cards left.**"
                }]
            }));
            return Promise.resolve("END");
        }
        hand.push(fillPlayers(card, game.players));
    }

    // Update
    const msg = game.activeMessage;
    msg.updateAll();
    player.createDM().then(dm => msg.send(dm));
    game.setupMessage.updateAll(i);
    return null;
}

export function removePlayer(i: ButtonInteraction, game: GameInstance<CAHContext, CAHState>, player: User, index: number): Promise<CAHState> | null {
    const remove = () => {
        game.players.splice(index, 1);

        // Change Czar
        if (game.context.czar >= index) {
            game.context.czar -= 1;
        }

        // Leave
        delete game.context.players[player.id];
        const sindex = game.context.shuffle.indexOf(player.id);
        if (sindex >= 0) game.context.shuffle.splice(sindex, 1);
    }
    
    const endMessage = (reason : string) => {
        game.activeMessage.endAll(i);

        remove();

        game.setupMessage.updateAll(i);
        game.sendAll(() => ({
            embeds: [{
                color: CAH.color,
                description: reason
            }]
        }));
    };

    // Check if we can still continue playing
    if (game.players.length - 1 < 2) {
        endMessage("**The game has ended because there are not enough players left.**");
        return Promise.resolve("END");
    }

    // Check if we need to skip a round
    if (game.context.czar === index) {
        endMessage("**The round has been skipped because the Card Czar left the game.**");
        return Promise.resolve(setupHAND(game));
    }

    // Continue
    const msg = game.activeMessage;

    if (i.channel?.type === "DM") {
        msg.end(i);
    } else if (player.dmChannel) {
        const m = msg.messages[player.dmChannel.id];
        if (m) msg.endMessage(m);
    }

    remove();
    msg.updateAll(i);
    game.setupMessage.updateAll(i);
    return null;
}

export const randoId = "rando";

export function getWhiteCard(ctx: CAHContext) {
    const idx = ctx.whiteDeck.pop();
    if (!idx) return null;

    let size = 0;
    for (let i = 0; i < packs.length; i++) {
        if (ctx.packs.includes(i)) {
            if (idx >= size + packs[i].cards.white.length) {
                size += packs[i].cards.white.length;
            } else {
                return packs[i].cards.white[idx - size];
            }
        }
    }
    return null;
}

export function getBlackCard(ctx: CAHContext) {
    const idx = ctx.blackDeck.pop();
    if (!idx) return null;

    let size = 0;
    for (let i = 0; i < packs.length; i++) {
        if (ctx.packs.includes(i)) {
            if (idx >= size + packs[i].cards.black.length) {
                size += packs[i].cards.black.length;
            } else {
                return packs[i].cards.black[idx - size];
            }
        }
    }
    return null;
}

function createContext() {
    return {
        players: {} as {[key: Snowflake]: {
            hand: Card[],
            playing: (number | string | null)[],
            points: number,
            hidden: boolean,
        }},

        shuffle: [] as string[],

        flags: [
            false, // rando
            false, // quiplash
        ],

        maxPoints: 8,
        handCards: 10,

        packs: [] as number[],
        blackDeck: [] as number[],
        whiteDeck: [] as number[],

        prompt: null as Card | null,
        czar: -1,
    };
}

export type CAHContext = ReturnType<typeof createContext>;
export type CAHState = "HAND" | "READ" | "END";

export const CAH: Game<CAHContext, CAHState> = {
    name: "Crappy Ableist Humor",
    color: 0x000000,
    playedInDms: true,
    createContext,
    setup,
    change: {
        HAND: displayHAND,
        READ: displayREAD,
    },
    resume: {
        HAND: resumeHAND,
        READ: resumeREAD,
        END: end,
    }
}
