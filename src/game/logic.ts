import assert from "assert";
import { CommandInteraction, Message, MessageComponentInteraction, ModalMessageModalSubmitInteraction, Snowflake, User } from "discord.js";
import { MessageOptions } from "../util/message";

export type GameType<C> = {
    name: string,
    color: number,
    logic: Logic<unknown, C>,
    initialContext(): C,
}

export type MessageGenerator = (user: User | null) => MessageOptions;

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

export type Game = {
    allowSpectators(): void;

    addPlayer   (player: User, i?: UserInteraction): boolean;
    removePlayer(player: User, i?: UserInteraction): boolean;

    send(players: User[], message: MessageGenerator | MessageOptions, sendSpectators?: boolean): void;

    updateLobby(message : MessageOptions, i?: UserInteraction | CommandInteraction): void;
    closeLobby (message?: MessageOptions, i?: UserInteraction, keepButtons?: string[]): void;

    updateMessage(players: User[], message : MessageGenerator | MessageOptions, i?: UserInteraction, sendSpectators?: boolean): void;
    closeMessage (players: User[], message?: MessageGenerator | MessageOptions, i?: UserInteraction,  endSpectators?: boolean): void;

    loadPack(id: string): void;
    getPack (id: string): Pack | null;

    getGuild(): Snowflake;
}

export type UserInteraction = MessageComponentInteraction | ModalMessageModalSubmitInteraction;

export type Event = {
    type: 'start',
    interaction: CommandInteraction,
} | {
    type: 'interaction',
    interaction: UserInteraction,
} | {
    type: 'add' | 'remove',
    interaction?: UserInteraction,
    player: User,
} | {
    type: 'dm',
    message: Message,
} | {
    type: 'pack_loaded',
    id: string,
};

function getPlayer(e: Event): User | null {
    switch (e.type) {
        case 'start': return null;
        case 'pack_loaded': return null;

        case 'interaction': return e.interaction.user;
        case 'dm': return e.message.author;

        case 'add': return e.player;
        case 'remove': return e.player;
    }
}

export type Transformer<A, B, C> = (game: Game, players: User[], ctx: C, a: A) => B;
export type Logic<T, C> = Transformer<void, Generator<void, T, Event>, C>

export type ContextOf<T> = T extends Logic<any, infer C> ? C : never;

export function sequence<T, C>(...logics: [...Logic<unknown, C>[], Logic<T, C>]): Logic<T, { idx: number, ctx: C }> {
    return function* (game, players, ctx) {
        for (; ctx.idx < logics.length - 1; ctx.idx++) {
            yield* logics[ctx.idx](game, players, ctx.ctx);
        }
        return (yield* logics[ctx.idx](game, players, ctx.ctx)) as T;
    };
}

export type All<T> = {[key: Snowflake]: T};

export function all<T, C>(logic: Logic<T, C>, init: Transformer<User, C, void>): Logic<All<T>, { val: All<T>, ctx: All<C> }> {
    return function* (game, players, ctx) {
        const generators: All<Generator<void, T, Event>> = {};
        for (const player of players) {

            if (player.id in ctx.val) {
                continue;
            }
            if (!(player.id in ctx.ctx)) {
                ctx.ctx[player.id] = init(game, players, undefined, player);
            }

            const gen = logic(game, [player], ctx.ctx[player.id]);
            const res = gen.next();
            if (res.done) {
                ctx.val[player.id] = res.value;
            } else {
                generators[player.id] = gen;
            }
        }

        while (true) {
            // check if done
            if (players.every(p => p.id in ctx.val)) {
                return ctx.val;
            }

            const event = yield;
            if (event.type === 'add') {
                // add player
                const player = event.player;
                ctx.ctx[player.id] = init(game, players, undefined, player);

                const gen = logic(game, [player], ctx.ctx[player.id]);
                const res = gen.next();
                if (res.done) {
                    ctx.val[player.id] = res.value;
                } else {
                    generators[player.id] = gen;
                }
            } else if (event.type === 'remove') {
                // remove player
                delete ctx.ctx[event.player.id];
                delete ctx.val[event.player.id];
            } else {
                // event
                const player = getPlayer(event);
                let toSend: [Snowflake, Generator<void, T, Event>][];
                if (player !== null) {
                    toSend = [[player.id, generators[player.id]]];
                } else {
                    toSend = Object.entries(generators);
                }

                for (const [id, generator] of toSend) {
                    const res = generator.next(event);
                    if (res.done) {
                        ctx.val[id] = res.value;
                        delete generators[id];
                    }
                }
            }
        }
    };
}

export function then<A, B, C>(logic: Logic<A, C>, f: Transformer<A, B, C>): Logic<B, C> {
    return function* (game, players, ctx) {
        const a = yield* logic(game, players, ctx);
        return f(game, players, ctx, a);
    };
}

export function loop<C>(logic: Logic<boolean, C>): Logic<void, C> {
    return function* (game, players, ctx) {
        while (true) {
            const b = yield* logic(game, players, ctx);
            if (!b) return;
        }
    };
}

export function before<T, C>(before: Logic<unknown, C>, logic: Logic<T, C>): Logic<T, C> {
    return function* (game, players, ctx) {
        const start = yield;
        assert(start.type === 'start');

        yield* before(game, players, ctx);

        const generator = logic(game, players, ctx);
        const res1 = generator.next();
        if (res1.done) return res1.value;
        const res2 = generator.next(start);
        if (res2.done) return res2.value;

        while (true) {
            const event = yield;
            const res3 = generator.next(event);
            if (res3.done) return res3.value;
        }
    };
}

export function or<T, C>(...logics: Logic<T, C>[]): Logic<T, C> {
    return function* (game, players, ctx) {
        const generators: Generator<void, T, Event>[] = [];
        for (const logic of logics) {
            const gen = logic(game, players, ctx);
            const res = gen.next();
            if (res.done) return res.value;
            generators.push(gen);
        }
        while (true) {
            const event = yield;
            for (const generator of generators) {
                const res = generator.next(event);
                if (res.done) return res.value;
            }
        }
    };
}

export function forward<T, A, B>(a: Logic<B | null, A>, b: Logic<T, B>): Logic<T | null, { a: A } | { b: B }> {
    return function* (game, players, ctx: any) {
        if ('a' in ctx) {
            const bctx = yield* a(game, players, ctx.a);
            if (bctx === null) return null;

            ctx.b = bctx;
            delete ctx.a;
        }
        return yield* b(game, players, ctx.b);
    }
}
