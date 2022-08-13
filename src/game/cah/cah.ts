import { ButtonInteraction, User, Snowflake } from "discord.js";
import { countBlanks, escapeDiscord, fillPlayers } from "../../util/card";
import { MessageController } from "../../util/message";
import { Game, GameInstance, shuffle } from "../game";
import { end } from "./end";
import { basePack, fullPack } from "./packs/cahstandard";
import { play } from "./play";
import { read } from "./read";
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
export const epack = eppgroep ? escapePack({
    name: "EPPGroep",
    cards: eppgroep,
}) : undefined;

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

export function addPlayer(i: ButtonInteraction, game: GameInstance, player: User, state: CAHState, resolve: (value: CAHAction) => void) {
    // Add player
    state.players[player.id] = {
        hand: [],
        playing: state.prompt ? Array(countBlanks(state.prompt)).fill(undefined) : [],
        points: 0,
        hidden: false,
    }

    const hand = state.players[player.id].hand;
    while (hand.length < state.handCards) {
        const card = state.whiteDeck.pop();
        if (!card) {
            game.activeMessage!.endAll();
            game.setupMessage!.updateAll(i);
            game.sendAll(() => ({
                embeds: [{
                    color: CAH.color,
                    description: "**The game has ended because there are not enough white cards left.**"
                }]
            }));
            resolve(CAHAction.End);
            return;
        }
        hand.push(fillPlayers(card, game.players));
    }

    // Update
    const msg = game.activeMessage!;
    msg.updateAll();
    player.createDM().then(dm => msg.send(dm));
    game.setupMessage!.updateAll(i);
}

export function removePlayer(i: ButtonInteraction, game: GameInstance, player: User, index: number, state: CAHState, resolve: (value: CAHAction) => void) {
    const remove = () => {
        // Instert player hand back into deck
        for (const card of state.players[player.id].hand) state.whiteDeck.push(card);
        shuffle(state.whiteDeck);

        // Change Czar
        if (state.czar >= index) {
            state.czar -= 1;
        }

        // Leave
        delete state.players[player.id];
        const sindex = state.shuffle.indexOf(player.id);
        if (sindex >= 0) state.shuffle.splice(sindex, 1);
    }
    
    const end = (reason : string) => {
        game.activeMessage!.endAll(i);

        remove();

        game.setupMessage!.updateAll(i);
        game.sendAll(() => ({
            embeds: [{
                color: CAH.color,
                description: reason
            }]
        }));
    };

    // Check if we can still continue playing
    if (game.players.length < 2) {
        end("**The game has ended because there are not enough players left.**");
        resolve(CAHAction.End);
        return;
    }

    // Check if we need to skip a round
    if (state.czar === index) {
        end("**The round has been skipped because the Card Czar left the game.**");
        resolve(CAHAction.Skip);
        return;
    }

    // Continue
    const msg = game.activeMessage!;

    if (i.channel?.type === "DM") {
        msg.end(i);
    } else if (player.dmChannel) {
        const m = msg.messages[player.dmChannel.id];
        if (m) msg.endMessage(m);
    }

    remove();
    msg.updateAll(i);
    game.setupMessage!.updateAll(i);
}

export const randoId = "rando";

function createInitialState() {
    return {
        players: {} as {[key: Snowflake]: {
            hand: Card[],
            playing: (number | undefined)[],
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

        blackDeck: [] as Card[],
        whiteDeck: [] as Card[],

        prompt: undefined as Card | undefined,
        czar: -1,
    };
}

export type CAHState = ReturnType<typeof createInitialState>;

export enum CAHAction {
    End,
    Skip,
    Continue
}

export const CAH: Game = {
    name: "Crappy Ableist Humor",
    color: "#000000",
    playedInDms: true,
    play: async (game, i) => {
        const state = createInitialState();

        await setup(game, state, i);

        loop:
        while(true) {
            game.createMessage();
            switch (await play(game, state)) {
                case CAHAction.End: break loop;
                case CAHAction.Skip: continue loop;
            }
            switch (await read(game, state)) {
                case CAHAction.End: break loop;
                case CAHAction.Skip: continue loop;
            }
        }

        await end(game, state);
    }
}
