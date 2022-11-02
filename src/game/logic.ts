import { Awaitable } from "@discordjs/builders";
import { CommandInteraction, MessageComponentInteraction, ModalSubmitInteraction, User } from "discord.js";
import { MessageOptions } from "../util/message";

export type MessageGenerator = (user: User | null) => MessageOptions | null;

export type Game = {
    players: User[];

    allowSpectators(): Promise<void>;

    sendSpectators(message: Partial<MessageOptions>): Promise<void>;
    sendPlayers   (message: Partial<MessageOptions>): Promise<void>;
    sendAll       (message: Partial<MessageOptions>): Promise<void>;
    send(message: (user: User | null) => Partial<MessageOptions> | null): Promise<void>;

    updateLobby(message : MessageOptions,   i?: UserInteraction | CommandInteraction): Promise<void>;
    closeLobby (i?: UserInteraction, exceptions?: string[]): Promise<void>;

    updateMessage(message : MessageGenerator, i?: UserInteraction): Promise<void>;
    updateMessage(message : MessageOptions,   i : UserInteraction): Promise<void>;
    closeMessage (message?: MessageGenerator, i?: UserInteraction, filter?: (user: User | null) => boolean): Promise<void>;
}

export type UserInteraction = MessageComponentInteraction | ModalSubmitInteraction;

export type Resolve<T> = (t: T, i?: UserInteraction) => void;

export type Logic<T, C> = {
    onEnter?(ctx: C, game: Game, resolve: Resolve<T>, i?: CommandInteraction): void,
    onExit?(ctx: C, game: Game): Awaitable<void>,
    onInteraction?(ctx: C, game: Game, resolve: Resolve<T>, interaction: UserInteraction): void,
}

export type KeyValuePair<K, V> = {
    state: K,
    context: V,
}

export type KeyValuePairOf<Type> = {[Property in keyof Type]: KeyValuePair<Property, Type[Property]>}[keyof Type];

export type LogicMap<T, S> = {[ID in keyof S]: Logic<T | KeyValuePairOf<S>, S[ID]>};

export type ContextOf<T> = T extends Logic<unknown, infer C> ? C : never;
export type ReturnOf<T> = T extends Logic<infer T, unknown> ? T : never;

export class LogicSequence<T, S> implements Logic<T, KeyValuePairOf<S>> {
    
    map: LogicMap<T, S>;

    constructor(map: LogicMap<T, S>) {
        this.map = map;
    }

    async onResolve(ctx: KeyValuePairOf<S>, game: Game, resolve: Resolve<T>, t: T | KeyValuePairOf<S>, i?: UserInteraction) {
        if (t && 'state' in t) {
            await this.map[ctx.state].onExit?.(ctx.context, game);
            ctx.state = t.state;
            ctx.context = t.context;
            this.map[ctx.state].onEnter?.(ctx.context, game, (t, i) => this.onResolve(ctx, game, resolve, t, i));
        } else {
            resolve(t, i);
        }
    }

    onEnter(ctx: KeyValuePairOf<S>, game: Game, resolve: Resolve<T>, i?: CommandInteraction) {
        this.map[ctx.state].onEnter?.(ctx.context, game, (t, i) => this.onResolve(ctx, game, resolve, t, i), i);
    }

    onExit(ctx: KeyValuePairOf<S>, game: Game) {
        return this.map[ctx.state].onExit?.(ctx.context, game);
    }

    onInteraction(ctx: KeyValuePairOf<S>, game: Game, resolve: Resolve<T>, i: UserInteraction) {
        this.map[ctx.state].onInteraction?.(ctx.context, game, (t, i) => this.onResolve(ctx, game, resolve, t, i), i);
    }

}

export function or<T, C>(...as: Logic<T, C>[]): Logic<T, C> {

    const es: any[] = as.filter(a => a.onEnter);
    const rs: any[] = as.filter(a => a.onExit);
    const is: any[] = as.filter(a => a.onInteraction);

    return {
        onEnter()       { for (const f of es) f.onEnter(...arguments) },
        async onExit()  {
            const a: Awaitable<void>[] = [];
            for (const f of rs) a.push(f.onExit(...arguments))
            await Promise.all(a);
        },
        onInteraction() { for (const f of is) f.onInteraction(...arguments) },
    };
}

export function then<A, B, C>(a: Logic<A, C>, f: (ctx: C, game: Game, a: A, i?: UserInteraction) => Awaitable<B>): Logic<B, C> {
    return {
        onEnter(ctx, game, resolve, i) {
            a.onEnter?.(ctx, game, async (t, i) => resolve(await f(ctx, game, t, i), i), i);
        },
        onExit: a.onExit,
        onInteraction(ctx, game, resolve, i) {
            a.onInteraction?.(ctx, game, async (t, i) => resolve(await f(ctx, game, t, i), i), i);
        },
    };
}

export function next<K, C>(a: Logic<unknown, C>, state: K): Logic<KeyValuePair<K, C>, C> {
    return then(a, ctx => ({ state, context: ctx }));
}

export function loop<A, B, C>(a: Logic<A, C>, f: (ctx: C, game: Game, a: A, i?: UserInteraction) => Awaitable<B | null>): Logic<B, C> {

    async function onResolve(ctx: C, game: Game, ret: A, resolve: Resolve<B>, i?: UserInteraction) {
        const t = await f(ctx, game, ret, i);
        if (t === null) {
            // a.onExit?.(ctx, game);
            a.onEnter?.(ctx, game, (t, i) => onResolve(ctx, game, t, resolve, i))
        } else {
            resolve(t, i);
        }
    }

    return {
        onEnter(ctx, game, resolve, i) {
            a.onEnter?.(ctx, game, (t, i) => onResolve(ctx, game, t, resolve, i), i);
        },
        onExit: a.onExit,
        onInteraction(ctx, game, resolve, i) {
            a.onInteraction?.(ctx, game, (t, i) => onResolve(ctx, game, t, resolve, i), i);
        }
    }
}

export function forward<K, A, B>(a: Logic<B | null, A>, state: K): Logic<void | KeyValuePair<K, B>, A> {
    return then(a, (_ctx, _game, b) => {
        if (b !== null) return { state, context: b };
    });
}

