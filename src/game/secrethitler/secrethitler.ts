import { Game, shuffle } from "../game";
import { Snowflake, User } from "discord.js";
import { BasePack, TrumpPack } from "./packs";
import { setup } from "./setup";
import { roles } from "./roles";
import { nominate } from "./nominate";

export type Player = {
    bot: boolean,
    investigated: boolean,
    id: Snowflake | null,
    fascist: boolean | null,
    hitler: boolean | null,
    role: string | null,
    dead: boolean,
    vote: boolean | null,
}

export const emoji = {
    emptySquare: "⬛",
    emptyAction: "▫️",

    fascistTile: "🟥",
    liberalTile: "🟦",

    pickChancellor: "👉",
    chaos: "😱",
    hitlerCanWin: "❗",

    governmentFormed: "✅",
    governmentFailed: "🚫",

    peek: "👀",
    investigate: "🔍",
    election: "🗳️",
    execution: "🔫",
    dead: "💀",

    liberalWin: "🕊️",
    fascistWin: "💀"
}

export function getName(player: Player, players: Player[]) {
    return player.bot ? "`bot" + players.filter(p => p.bot).indexOf(player) + "`" : `<@${player.id}>`;
}

export function getUsername(player: Player, players: Player[], users: User[]) {
    return player.bot ? "bot" + players.filter(p => p.bot).indexOf(player) : users.find(u => u.id === player.id).username;
}

export function getStatus(player: Player) {
    return player.dead ? emoji.dead : player.investigated ? emoji.investigate : emoji.emptySquare;
}

export function everyoneVoted(players: Player[]) {
    return !players.some(p => !p.dead && p.vote === null);
}

export function getVoted(players: Player[]) {
    return players.filter(p => !p.dead && p.vote !== null);
}

export type ExecutiveAction = {
    emoji: string,
    name: string,
    player: boolean, // whether or not a player needs to be selected
    action: () => void,
    description: string,
    investigate: boolean // whether or not the invesitaged flag gets set, prevented the player to be investigated in the future
}

export const actions: { [key:string]: ExecutiveAction } = {
    peek: {
        emoji: emoji.peek,
        name: "Policy Peek",
        player: false,
        action: () => {},
        description: "Due to the enactment of a new Fascist Policy, the President must view the top three Policies of the draw pile.",
        investigate: false,
    },
    investigate: {
        emoji: emoji.investigate,
        name: "Investigate Loyalty",
        player: true,
        action: () => {},
        description: "Due to the enactment of a new Fascist Policy, the President must choose any other player at the table and investigate their party membership. The President is free to discuss the issue with the other players, but ultimately the President gets to decide who to pick.",
        investigate: true,
    },
    election: {
        emoji: emoji.election,
        name: "Call Special Election",
        player: true,
        action: () => {},
        description: "Due to the enactment of a new Fascist Policy, the President must choose any other player at the table to be the next President. After this Special Election, the next President will still be the person below the person who enacted the Special Election. The President is free to discuss the issue with the other players, but ultimately the President gets to decide who to pick.",
        investigate: false,
    },
    execution: {
        emoji: emoji.execution,
        name: "Execution",
        player: true,
        action: () => {},
        description: "Due to the enactment of a new Fascist Policy, the President must choose any other player at the table and execute them. If that player is {}, the game ends in a Liberal victory. Otherwise, the table should **not** learn whether the player was a Fascist or Liberal. The President is free to discuss the issue with the other players, but ultimately the President gets to decide who to pick.",
        investigate: false,
    }
}

export type Board = [ExecutiveAction, ExecutiveAction, ExecutiveAction, ExecutiveAction, ExecutiveAction];

export const boards: Board[] = [
    [null, null, actions.peek, actions.execution, actions.execution],
    [null, actions.investigate, actions.election, actions.execution, actions.execution],
    [actions.investigate, actions.investigate, actions.election, actions.execution, actions.execution]
]

export type BoardState = {
    fascistBoard: Board,
    drawPile: Policy[],
    discardPile: Policy[],
    fascistPoints: number,
    liberalPoints: number,
    tracker: number,
}

export function drawBoard(state: BoardState): string {
     return "" +
        `\` Liberal \` ${emoji.emptySquare}${[...Array(5).keys()].map(i => (i < state.liberalPoints ? emoji.liberalTile : i === 4 ? emoji.liberalWin : emoji.emptyAction)).join("")} \` ${state.liberalPoints}/5 \`\n` +
        `\` Fascist \` ${[...Array(6).keys()].map(i => (i < state.fascistPoints ? emoji.fascistTile : i === 5 ? emoji.fascistWin : (state.fascistBoard[i]?.emoji || emoji.emptyAction))).join("")} \` ${state.fascistPoints}/6 \`\n\n` +
        `\`Draw Pile\` \` ${state.drawPile.length > 9 ? state.drawPile.length : ` ${state.drawPile.length}`} \` policies\n` +
        `\` Discard \` \` ${state.discardPile.length > 9 ? state.discardPile.length : ` ${state.discardPile.length}`} \` policies\n\n` +
        `\` Tracker \` \` ${state.tracker}/3 \` failed governments`
}

export function drawPlayers(players: Player[], president: number): string {
    return players.map((p, i) => `${i === president ? emoji.pickChancellor : getStatus(p)} ${getName(p, players)}`).join("\n");
}

export function getEligibleChancellors(players: Player[], president: number, lastPresident: number | null, lastChancellor: number | null) {
    const alive = players.filter(p => !p.dead).length;
    if (alive <= 5) return players.map((_p, i) => i).filter(i => !players[i].dead && i !== president && i !== lastChancellor);
    else return players.map((_p, i) => i).filter(i => !players[i].dead && i !== president && i !== lastPresident && i !== lastChancellor);
}

export function getEligibleOrderPick(players: Player[], president: number, order: ExecutiveAction) {
    return players.map((_p, i) => i).filter(i => !players[i].dead && i !== president && (!order.investigate || !players[i].investigated))
}

export type Policy = "Fascist" | "Liberal";

const policyDeck: Policy[] = [ // 6 liberal, 11 fascist
    "Liberal", "Liberal", "Liberal", "Liberal", "Liberal", "Liberal",
    "Fascist", "Fascist", "Fascist", "Fascist", "Fascist", "Fascist", "Fascist", "Fascist", "Fascist", "Fascist", "Fascist",
]

export type CardPack = {
    name: string,

    hitler: string, // fascist leader
    vice: string, // fascist #2

    liberal: string[], // the six liberals
    fascist: string[], // the other two fascists
}

export const packs: CardPack[] = [BasePack, TrumpPack];

export function getTitle(context: SHContext) {
    return SecretHitler.name + " — Round " + context.round;
}

const context = () => {
    return {
        players: [] as Player[],
        hitler: null as number | null,
        pack: packs[0],

        board: {
            fascistBoard: boards[0],

            drawPile: shuffle([...policyDeck]),
            discardPile: [] as Policy[],

            fascistPoints: 0,
            liberalPoints: 0,
            tracker: 0,
        } as BoardState,

        president: 0,
        chancellor: null as number | null,

        lastPresident: null as number | null,
        lastChancellor: null as number | null,

        nextPresident: 1,

        round: 1
    }
}

export type SHContext = ReturnType<typeof context>;
export type SHStates = "roles" | "nominate";

export const SecretHitler: Game<SHContext, SHStates> = {

    name: "Secret Hitler",
    color: "#F2654B",
    context: context,

    onStart: setup,
    states: {
        "roles": roles,
        "nominate": nominate,
    }

}
