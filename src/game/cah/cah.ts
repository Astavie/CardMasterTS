import { BaseCommandInteraction, Interaction, MessageComponentInteraction, User } from "discord.js";
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
    { name: "CAH Base", cards: basePack },
    { name: "CAH Full", cards: fullPack },
];

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

export function getBlanks(prompt: string) {
    return prompt.match(/_/gi)?.length || 1;
}

export function realizeCard(card: string, players: User[]) {
    const copy = [...players];
    return card.replaceAll("{}", () => copy.splice(Math.floor(Math.random()*copy.length), 1)[0].toString());
}

export function fillCard(card: string, hand: string[], playing: (number | undefined)[]) {
    const blanks = playing.map(i => i === undefined ? "\\_" : hand[i]);
    return card.replaceAll("_", () => {
        let card = blanks.shift() as string;
        if (card.endsWith('.')) {
            card = card.substring(0, card.length - 1);
        }
        return `**${card}**`;
    });
}

export function addPlayer(i: Interaction, game: GameInstance, player: User, state: CAHState, resolve: (value: CAHAction) => void, msg: MessageController) {
    const setup = game.setupMessage?.isMyInteraction(i);

    if (!setup) {
        // TODO: Slash join
    }

    // Add player
    state.players[player.id] = {
        hand: [],
        playing: [],
        points: 0
    }

    const hand = state.players[player.id].hand;
    while (hand.length < state.handCards) {
        const card = state.whiteDeck.pop();
        if (!card) {
            msg.endAll();
            game.setupMessage?.updateOrEditAll(setup ? i as MessageComponentInteraction : undefined);
            game.sendAll(new MessageController(() => ({
                embeds: [{
                    color: CAH.color,
                    description: "**The game has ended because there are not enough white cards left.**"
                }]
            })));
            resolve(CAHAction.End);
            return;
        }
        hand.push(realizeCard(card, game.players));
    }

    // Update
    msg.editAll();
    player.createDM().then(dm => msg.send(dm));
    game.setupMessage?.updateOrEditAll(setup ? i as MessageComponentInteraction : undefined);
}

export function removePlayer(i: Interaction, game: GameInstance, player: User, index: number, state: CAHState, resolve: (value: CAHAction) => void, msg: MessageController) {
    const own = msg.isMyInteraction(i);
    const setup = game.setupMessage?.isMyInteraction(i);

    if (!own && !setup) {
        // TODO: Slash join
    }

    const end = () => {
        // Instert player hand back into deck
        for (const card of state.players[player.id].hand) state.whiteDeck.push(card);
        shuffle(state.whiteDeck);

        // Leave
        delete state.players[player.id];
        const sindex = state.shuffle.indexOf(player.id);
        if (sindex >= 0) state.shuffle.splice(sindex, 1);
    };

    // Check if we can still continue playing
    if (game.players.length < 2) {
        msg.endAll(own ? i as MessageComponentInteraction : undefined);
        end();
        game.setupMessage?.updateOrEditAll(setup ? i as MessageComponentInteraction : undefined);
        game.sendAll(new MessageController(() => ({
            embeds: [{
                color: CAH.color,
                description: "**The game has ended because there are not enough players left.**"
            }]
        })));
        resolve(CAHAction.End);
        return;
    }

    // Check if we need to skip a round
    if (state.czar === index) {
        state.czar -= 1;

        msg.endAll(own ? i as MessageComponentInteraction : undefined);
        end();
        game.setupMessage?.updateOrEditAll(setup ? i as MessageComponentInteraction : undefined);
        game.sendAll(new MessageController(() => ({
            embeds: [{
                color: CAH.color,
                description: "**The round has been skipped because the Card Czar left the game.**"
            }]
        })));
        resolve(CAHAction.Skip);
        return;
    } else if (state.czar > index) {
        state.czar -= 1;
    }

    // Continue
    if (own && i.channel?.type == "DM") {
        msg.end(i as MessageComponentInteraction);
        end();
        msg.editAll();
        game.setupMessage?.updateOrEditAll(setup ? i as MessageComponentInteraction : undefined);
    } else {
        for (const m of msg.messages) {
            if (m.channel.type === "DM" && m.channel.recipient === player) {
                msg.endMessage(m);
                break;
            }
        }

        end();
        msg.updateOrEditAll(own ? i as MessageComponentInteraction : undefined);
        game.setupMessage?.updateOrEditAll(setup ? i as MessageComponentInteraction : undefined);
    }
}

export const randoId = "rando";

function createInitialState() {
    return {
        players: {} as {[key: string]: {
            hand: Card[],
            playing: (number | undefined)[],
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
            const msg = new MessageController();
            switch (await play(game, state, msg)) {
                case CAHAction.End: break loop;
                case CAHAction.Skip: continue loop;
            }
            switch (await read(game, state, msg)) {
                case CAHAction.End: break loop;
                case CAHAction.Skip: continue loop;
            }
        }

        await end(game, state);
    }
}
