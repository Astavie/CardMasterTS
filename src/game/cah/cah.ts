import { randomInt } from "crypto";
import { User } from "discord.js";
import { countRealizations, realizeCard } from "../../util/card";
import { GameType } from "../game";
import { ContextOf, forward, Logic, LogicMap, LogicSequence, loop, next, or, then } from "../logic";
import { gameResultLogic, joinLeaveLogic, prepareRound } from "./game";
import { handLogic } from "./hand";
import { readLogic } from "./read";
import { packs, SetupContext, setupLogic, startGame } from "./setup";

export type Card = [number, number, string[]]; // [pack, card, realizations]
export type UnrealizedCard = Card | [number, number]; // [pack, card]

export type Pack = {
    name: string
    cards: {
        white: string[]
        black: string[]
    }
}

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

export function getWhiteCard(card: Card) {
    return realizeCard(packs[card[0]].cards.white[card[1]], card[2]);
}

export function getBlackCard(card: Card) {
    return realizeCard(packs[card[0]].cards.black[card[1]], card[2]);
}

export function realizeWhiteCard(card: UnrealizedCard, players: User[]): Card {
    if (card[2]) return card as Card;

    const spots = countRealizations(packs[card[0]].cards.white[card[1]]);
    const fills: string[] = [];
    for (let i = 0; i < spots; i++) {
        fills.push(players[randomInt(players.length)].toString());
    }
    return [card[0], card[1], fills];
}

export function realizeBlackCard(card: UnrealizedCard, players: User[]): Card {
    if (card[2]) return card as Card;

    const spots = countRealizations(packs[card[0]].cards.black[card[1]]);
    const fills: string[] = [];
    for (let i = 0; i < spots; i++) {
        fills.push(players[randomInt(players.length)].toString());
    }
    return [card[0], card[1], fills];
}

// -- round logic --
export type BaseRoundContext = {
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
    
    randoWon?: boolean,
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

const roundMap: LogicMap<void, Record<'hand' | 'read', RoundContext>> = {
    hand: next(handLogic, 'read'),
    read: readLogic
}

const roundLogic = new LogicSequence(roundMap); 
export type GameContext = ContextOf<typeof roundLogic>;

// -- game logic --
let gameLogic =
    or(
        loop(
            or(joinLeaveLogic, roundLogic),
            prepareRound,
        ),
        gameResultLogic
    ); // first add/remove players, then further game logic

// -- global logic --
const globalMap: LogicMap<void, { 'setup': Partial<SetupContext>, 'game': GameContext }> = {
    setup: forward(loop(setupLogic, startGame), 'game'),
    game:  gameLogic,
}

const globalLogic = new LogicSequence(globalMap);

type GlobalContext = ContextOf<typeof globalLogic>;

export const CAH: GameType<GlobalContext> = {
    name: "Crappy Ableist Humor",
    color: 0x000000,
    logic: globalLogic,
    initialContext() {
        return {
            state: 'setup',
            context: {},
        };
    },
}

