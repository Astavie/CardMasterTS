import { Awaitable } from "@discordjs/builders";
import { CommandInteraction, Message, MessageComponentInteraction, ModalMessageModalSubmitInteraction, Snowflake, User } from "discord.js";
import { MessageOptions } from "../util/message";

export type MessageGenerator = (user: User | null) => Awaitable<MessageOptions>;

export type Game = {
    allowSpectators(): Promise<void>;

    addPlayer   (player: User, i?: UserInteraction): Promise<boolean>;
    removePlayer(player: User, i?: UserInteraction): Promise<boolean>;

    send(players: User[], message: MessageGenerator | MessageOptions, sendSpectators?: boolean): Promise<void>;

    updateLobby(message : MessageOptions, i?: UserInteraction | CommandInteraction): Promise<void>;
    closeLobby (message?: MessageOptions, i?: UserInteraction, keepButtons?: string[]): Promise<void>;

    updateMessage(players: User[], message : MessageGenerator | MessageOptions, i?: UserInteraction, sendSpectators?: boolean): Promise<void>;
    closeMessage (players: User[], message?: MessageGenerator | MessageOptions, i?: UserInteraction, keepSpectators?: boolean): Promise<void>;

    getGuild(): Snowflake;
}

export type UserInteraction = MessageComponentInteraction | ModalMessageModalSubmitInteraction;

export type Resolve<T> = (t: T) => Promise<void>;

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
}

export type Transformer<A, B, C> = (game: Game, players: User[], ctx: C, a: A) => Awaitable<B>;
export type Generator<T, C> = Transformer<void, T, C>;
export type Logic<T, C> = Transformer<AsyncIterable<Event>, T, C>;

export type ContextOf<T> = T extends Logic<any, infer C> ? C : never;

export function cancelable(events: AsyncIterable<Event>): AsyncIterable<Event> & { cancel(): void } {
    const rejects = new Set<() => void>();
    let canceled = false;
    return {
        cancel() {
            canceled = true;
            for (const reject of rejects) {
                reject();
            }
        },
        [Symbol.asyncIterator]() {
            const parent = events[Symbol.asyncIterator]();
            return {
                async next() {
                    if (canceled) {
                        return { value: undefined, done: true };
                    }
                    try {
                        return await new Promise(async (resolve, reject) => {
                            rejects.add(reject);
                            const next = await parent.next();
                            rejects.delete(reject);
                            resolve(next);
                        });
                    } catch {
                        return { value: undefined, done: true };
                    }
                }
            }
        }
    }
}

export function sequence<C>(...logics: Logic<boolean, C>[]): Logic<boolean, { idx: number, ctx: C }> {
    return async (game, players, ctx, events) => {
        for (; ctx.idx < logics.length; ctx.idx++) {
            const resume = await logics[ctx.idx](game, players, ctx.ctx, events);
            if (!resume) return false;
        }
        return true;
    };
}

export function then<A, B, C>(logic: Logic<A, C>, f: Transformer<A, B, C>): Logic<B, C> {
    return async (game, players, ctx, events) => {
        const a = await logic(game, players, ctx, events);
        return await f(game, players, ctx, a);
    };
}


export function loop<C>(logic: Logic<boolean, C>): Logic<void, C> {
    return async (game, players, ctx, events) => {
        while (true) {
            const b = await logic(game, players, ctx, events);
            if (!b) return;
        }
    };
}

export function or<T, C>(...logics: Logic<T, C>[]): Logic<T, C> {
    return async (game, players, ctx, events) => {
        const wrapped = cancelable(events);
        const t = await Promise.any(logics.map(logic => logic(game, players, ctx, wrapped)));
        wrapped.cancel();
        return t;
    };
}

export function forward<T, A, B>(a: Logic<B | null, A>, b: Logic<T, B>): Logic<T | null, { a: A } | { b: B }> {
    return async (game, players, ctx: any, events) => {
        if ('a' in ctx) {
            const bctx = await a(game, players, ctx.a, events);
            if (bctx === null) return null;

            ctx.b = bctx;
            delete ctx.a;
        }
        return await b(game, players, ctx.b, events);
    }
}
