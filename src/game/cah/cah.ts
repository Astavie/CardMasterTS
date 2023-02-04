import { randomInt } from "crypto";
import { User } from "discord.js";
import { db } from "../../db";
import { countBlanks2, countRealizations, realizeCard } from "../../util/card";
import { forward, ContextOf, sequence, or, loop, then, Game, GameType, before, Logic } from "../logic";
import { gameResult, joinLeaveLogic, prepareRound } from "./game";
import { handLogic } from "./hand";
import { readLogic } from "./read";
import { defaultSetup, setupLogic } from "./setup";

export type Card = [string, number, string[]]; // [pack, card, realizations]
export type UnrealizedCard = Card | [string, number]; // [pack, card]

export function getPlayerList(players: User[], rando: boolean) {
    const ids = players.map(p => p.toString() as string);
    if (rando) {
        ids.unshift("`Rando Cardrissian`");
    }
    return ids.length > 0 ? ids.join("\n") : "*None*";
}

export function getPointsList(players: User[], points: {[key: string]: number}, maxPoints: number) {
    const ids = players.map(p => "`" + points[p.id].toString().padStart(2) + "` " + p.toString());
    if (randoId in points) {
        ids.unshift("`" + points[randoId].toString().padStart(2) + "` `Rando Cardrissian`");
    }
    return ids.join("\n") + (maxPoints ? "\n`" + maxPoints.toString().padStart(2) + "` points to win" : "");
}

export const randoId = "rando";

export function getWhiteCard(game: Game, card: Card) {
    return realizeCard(game.getPack(card[0])!.cards.white[card[1]], card[2]);
}

export function getCard(card: string | { text: string }): string {
    return typeof card === 'string' ? card : card.text;
}

export function getBlackCard(game: Game, card: Card) {
    return realizeCard(getCard(game.getPack(card[0])!.cards.black[card[1]]), card[2]);
}

export function countBlanks(game: Game, card: UnrealizedCard) {
    const entry = game.getPack(card[0])!.cards.black[card[1]];
    if (typeof(entry) === 'string') return countBlanks2(entry);
    return entry.pick;
}

export function realizeWhiteCard(game: Game, card: UnrealizedCard, players: User[]): Card {
    if (card[2]) return card as Card;

    const spots = countRealizations(game.getPack(card[0])!.cards.white[card[1]]);
    const fills: string[] = [];
    for (let i = 0; i < spots; i++) {
        fills.push(players[randomInt(players.length)].toString());
    }
    return [card[0], card[1], fills];
}

export function realizeBlackCard(game: Game, card: UnrealizedCard, players: User[]): Card {
    if (card[2]) return card as Card;

    const spots = countRealizations(getCard(game.getPack(card[0])!.cards.black[card[1]]));
    const fills: string[] = [];
    for (let i = 0; i < spots; i++) {
        fills.push(players[randomInt(players.length)].toString());
    }
    return [card[0], card[1], fills];
}

// -- round logic --
export type BaseRoundContext = {
    packs: string[],
    shuffle: string[],
    prompt: Card,
    czar: number,

    points: {[key: string]: number},
    blackDeck: UnrealizedCard[],
    whiteDeck: UnrealizedCard[],
    maxPoints: number,
    quiplash: boolean,
};

export type CardRoundContext = BaseRoundContext & {
    quiplash: false,
    handCards: number,
    hand: {[key: string]: Card[] },
    playing: {[key: string]: (number | null)[] | 'double' },
    
    lastWinner?: string,
    doubleornothing?: {[key:string]: {
        cards: Card[],
        amount: number,
    }},
};

export type QuiplashRoundContext = BaseRoundContext & {
    quiplash: true,
    playing: {[key: string]: string[] | 'random' | null },
};

export type RoundContext = CardRoundContext | QuiplashRoundContext;

const roundLogic = sequence(handLogic, readLogic); 
export type GameContext = ContextOf<typeof roundLogic>;

const loadPacks: Logic<void, GlobalContext> = function* (game, _, ctx) {
    // get names of used packs
    let names: string[];
    if ('a' in ctx) {
        // setup: all guild packs
        names = Object.keys(db[game.getGuild()]?.packs ?? {});
    } else {
        // round: used packs
        names = ctx.b.ctx.packs;
    }

    // load packs
    for (const name of names) {
        game.loadPack(name);
    }

    // wait for packs to be loaded
    let loaded = 0;
    while (loaded < names.length) {
        const event = yield;
        if (event.type === 'pack_loaded') loaded += 1;
    }
}

// -- game logic --
const gameLogic = then(
    loop(then(
        or(joinLeaveLogic, roundLogic),
        prepareRound,
    )),
    gameResult,
);

// -- global logic --
const globalLogic = forward(setupLogic, gameLogic);
type GlobalContext = ContextOf<typeof globalLogic>;

export const CAH: GameType<GlobalContext> = {
    name: "Crappy Ableist Humor",
    color: 0x000000,
    logic: before(loadPacks, globalLogic),
    initialContext() {
        return {
            a: defaultSetup,
        };
    },
}

