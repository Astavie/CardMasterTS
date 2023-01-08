import { randomInt } from "crypto";
import { Snowflake, User } from "discord.js";
import { countRealizations, realizeCard } from "../../util/card";
import { GameType } from "../game";
import { ContextOf, forward, LogicMap, loop, next, or, sequence, singleResolve, then } from "../logic";
import { gameResultLogic, joinLeaveLogic, prepareRound } from "./game";
import { handLogic } from "./hand";
import { readLogic } from "./read";
import { CAHSetupContext, getPack, setupLogic } from "./setup";

export type Card = [string, number, string[]]; // [pack, card, realizations]
export type UnrealizedCard = Card | [string, number]; // [pack, card]

export type Pack = {
    name: string
    rawname: string
    cards: {
        white: string[]
        black: ({
            text: string,
            pick: number,
        } | string)[]
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

export async function getWhiteCard(guild: Snowflake, card: Card) {
    return realizeCard((await getPack(guild, card[0])).cards.white[card[1]], card[2]);
}

export function getCard(card: string | { text: string }): string {
    return typeof card === 'string' ? card : card.text;
}

export async function getBlackCard(guild: Snowflake, card: Card) {
    return realizeCard(getCard((await getPack(guild, card[0])).cards.black[card[1]]), card[2]);
}

export async function realizeWhiteCard(guild: Snowflake, card: UnrealizedCard, players: User[]): Promise<Card> {
    if (card[2]) return card as Card;

    const spots = countRealizations((await getPack(guild, card[0])).cards.white[card[1]]);
    const fills: string[] = [];
    for (let i = 0; i < spots; i++) {
        fills.push(players[randomInt(players.length)].toString());
    }
    return [card[0], card[1], fills];
}

export async function realizeBlackCard(guild: Snowflake, card: UnrealizedCard, players: User[]): Promise<Card> {
    if (card[2]) return card as Card;

    const spots = countRealizations(getCard((await getPack(guild, card[0])).cards.black[card[1]]));
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

const roundMap: LogicMap<true, Record<'hand' | 'read', RoundContext>> = {
    hand: next(handLogic, 'read'),
    read: then(readLogic, (_full, _void, resolve) => resolve(true))
}

const roundLogic = sequence(roundMap); 
export type GameContext = ContextOf<typeof roundLogic>;

// -- game logic --
let gameLogic =
    or(
        loop(
            singleResolve(or(joinLeaveLogic, roundLogic)),
            prepareRound,
        ),
        gameResultLogic
    ); // first add/remove players, then further game logic

// -- global logic --
const globalMap: LogicMap<void, { 'setup': Partial<CAHSetupContext>, 'game': GameContext }> = {
    setup: forward(setupLogic, 'game'),
    game:  gameLogic,
}

const globalLogic = sequence(globalMap);
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

