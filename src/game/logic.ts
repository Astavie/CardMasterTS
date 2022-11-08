import { Awaitable } from "@discordjs/builders";
import { CommandInteraction, Message, MessageComponentInteraction, ModalSubmitInteraction, User } from "discord.js";
import { MessageOptions } from "../util/message";

export type MessageGenerator = (user: User | null) => MessageOptions;

export type Game = {
    allowSpectators(): Promise<void>;

    addPlayer   (player: User, i?: UserInteraction): boolean;
    removePlayer(player: User, i?: UserInteraction): boolean;

    send(players: User[], message: MessageGenerator | MessageOptions, sendSpectators?: boolean): Promise<void>;

    updateLobby(message : MessageOptions, i?: UserInteraction | CommandInteraction): Promise<void>;
    closeLobby (message?: MessageOptions, i?: UserInteraction, keepButtons?: string[]): Promise<void>;

    updateMessage(players: User[], message : MessageGenerator | MessageOptions, i?: UserInteraction, sendSpectators?: boolean): Promise<void>;
    closeMessage (players: User[], message?: MessageGenerator | MessageOptions, i?: UserInteraction, keepSpectators?: boolean): Promise<void>;
}

export type UserInteraction = MessageComponentInteraction | ModalSubmitInteraction;

export type Resolve<T> = (t: T) => void;

export type FullContext<C> = {
    ctx: C,
    players: User[],
    game: Game,
};

export type Event = {
    type: 'update'
} | {
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

export type Logic<T, C> = {
    onEvent?(full: FullContext<C>, event: Event, resolve: Resolve<T>): void,
    onExit?(full: FullContext<C>): Awaitable<void>,
}

export type Next<K, V> = {
    state: K,
    context: V,
}

export type SequenceContext<Type> = {[Property in keyof Type]: Next<Property, Type[Property]>}[keyof Type];
export type LogicMap<T, S> = {[ID in keyof S]: Logic<T | SequenceContext<S>, S[ID]>};

export type ContextOf<T> = T extends Logic<unknown, infer C> ? C : never;
export type ReturnOf<T> = T extends Logic<infer T, unknown> ? T : never;

export function sequence<T, S>(logicmap: LogicMap<T, S>): Logic<T, SequenceContext<S>> {
    return then(singleResolve({
        onEvent(full, event, resolve: Resolve<T | SequenceContext<S>>) {
            logicmap[full.ctx.state].onEvent?.({ ...full, ctx: full.ctx.context }, event, resolve);
        },
        onExit(full) {
            return logicmap[full.ctx.state].onExit?.({ ...full, ctx: full.ctx.context });
        },
    }), async (full, t, resolve, old, logic) => {
        if (t && 'state' in t) {
            await logic.onExit?.(full);
            full.ctx.context = t.context;
            full.ctx.state   = t.state;
            logic.onEvent?.(full, { type: 'update' }, old);
        } else {
            resolve(t);
        }
    });
}

export type TelephoneContext<T, C> = AllContext<T, C> & {
    previous: T[][],
    shuffle: string[],
}

export function singleResolve<T, C>(logic: Logic<T, C>): Logic<T, C & { _resolve?: [any?]}> {
    return {
        onEvent: logic.onEvent && ((full, event, resolve) => {
            if (!full.ctx._resolve) full.ctx._resolve = [];

            const token = full.ctx._resolve;
            logic.onEvent!(full, event, t => {
                if (token.length) return;
                token.push(true);
                resolve(t);
            });
        }),
        onExit(full) {
            delete full.ctx._resolve;
            return logic.onExit?.(full);
        },
    };
}

export function telephone<T, A, B>(logic: Logic<T | null, B>, rounds: (ctx: A, players: number) => number, map: (ctx: A, round: number, previous?: T, current?: T) => B): Logic<[string, T][][], TelephoneContext<T, A>> {
    return then(
        singleResolve(all(logic, (ctx_, player) => {
            const ctx = ctx_ as TelephoneContext<T, A>;
            const round = ctx.previous[0].length;
            const previous = round ? ctx.previous[ctx.shuffle.indexOf(player.id)][round - 1] : undefined;
            const current = ctx.results[player.id];
            return map(ctx.context, round, previous, current);
        })),
        async (full: FullContext<TelephoneContext<T, A>>, t, resolve, old, logic) => {
            const round = full.ctx.previous[0].length;
            const max = rounds(full.ctx.context, full.players.length);

            if (round + 1 >= max) {
                for (let i = 0; i < full.ctx.shuffle.length; i++) {
                    const player = full.ctx.shuffle[i];
                    full.ctx.previous[i].push(t[player]);
                }

                full.ctx.results = {};

                // calculate final result
                const final: [string, T][][] = full.ctx.shuffle.map(() => []);
                for (let i = round + 1; i >= 0; i--) {
                    for (let j = 0; j < full.ctx.shuffle.length; j++) {
                        final[j].unshift([full.ctx.shuffle[j], full.ctx.previous[j][i]]);
                    }
                    // move players back
                    full.ctx.shuffle.push(full.ctx.shuffle.shift()!);
                }

                // resolve
                resolve(final);
            } else {
                await logic.onExit?.(full);
                for (let i = 0; i < full.ctx.shuffle.length; i++) {
                    const player = full.ctx.shuffle[i];
                    full.ctx.previous[i].push(t[player]);
                }

                // move players forward
                full.ctx.results = {};
                full.ctx.shuffle.unshift(full.ctx.shuffle.pop()!);
                
                // continue
                logic.onEvent?.(full, { type: 'update' }, old);
            }
        }
    )
}

export type AllContext<T, C> = {
    results: {[key:string]:T},
    context: C,
}

export function all<T, A, B>(logic: Logic<T | null, B>, map: (ctx: AllContext<T, A>, player: User) => B): Logic<{[key:string]:T}, AllContext<T, A>> {
    return then(
        or({
            onEvent(full, event) {
                if (event.type === 'remove') {
                    delete full.ctx.results[event.player.id];
                }
            }},
            first(logic, map),
        ), (full, [id, t], resolve, old, logic) => {
            if (t === null) {
                delete full.ctx.results[id];
            } else {
                full.ctx.results[id] = t;
            }

            if (Object.keys(full.ctx.results).length === full.players.length) {
                resolve(full.ctx.results);
            } else {
                logic.onEvent?.({ ...full, players: full.players.filter(p => p.id !== id) }, { type: 'update' }, old);
            }
        },
    );
}

export function first<T, A, B>(logic: Logic<T, B>, map: (ctx: A, player: User) => B): Logic<[string, T], A> {
    const l2 = then(logic, (full, t, resolve) => resolve([full.players[0].id, t]));
    return {
        onEvent: l2.onEvent && ((full, event, resolve) => {
            switch (event.type) {
                case 'start':
                case 'update':
                    for (const player of full.players) {
                        const ctx = map(full.ctx, player);
                        l2.onEvent!({ ...full, players: [player], ctx }, event, resolve);
                    }
                break;
                case 'interaction':
                    {
                        const ctx = map(full.ctx, event.interaction.user);
                        l2.onEvent!({ ...full, players: [event.interaction.user], ctx }, event, resolve);
                    }
                break;
                case 'dm':
                    {
                        const ctx = map(full.ctx, event.message.author);
                        l2.onEvent!({ ...full, players: [event.message.author], ctx }, event, resolve);
                    }
                break;
                case 'add':
                    {
                        const ctx = map(full.ctx, event.player);
                        l2.onEvent!({ ...full, players: [event.player], ctx }, { type: 'update' }, resolve);
                    }
                break;
            }
        }),
        onExit: l2.onExit && (async (full) => {
            const promises: Awaitable<void>[] = [];
            for (const player of full.players) {
                const ctx = map(full.ctx, player);
                promises.push(l2.onExit!({ ...full, players: [player], ctx }));
            }
            await Promise.all(promises);
        }),
    };
}

export function or<T, C>(...as: Logic<T, C>[]): Logic<T, C> {

    const es: any[] = as.filter(a => a.onEvent);
    const rs: any[] = as.filter(a => a.onExit);

    return {
        onEvent() {
            for (const f of es) f.onEvent(...arguments)
        },
        async onExit()  {
            const a: Awaitable<void>[] = [];
            for (const f of rs) a.push(f.onExit(...arguments))
            await Promise.all(a);
        },
    };
}

export function then<A, B, C>(a: Logic<A, C>, f: (full: FullContext<C>, a: A, resolve: Resolve<B>, old: Resolve<A>, logic: Logic<A, C>) => void): Logic<B, C> {
    const old = (full: FullContext<C>, t: A, resolve: Resolve<B>) => f(full, t, resolve, t => old(full, t, resolve), a);
    return {
        onEvent: a.onEvent && ((full, event, resolve) => {
            a.onEvent!(full, event, t => old(full, t, resolve));
        }),
        onExit: a.onExit,
    };
}

export function next<K, C>(a: Logic<unknown, C>, state: K): Logic<Next<K, C>, C> {
    return then(a, ({ ctx }, _, resolve) => resolve({ state, context: ctx }));
}

export function loop<T, C>(a: Logic<T, C>, f: (full: FullContext<C>, t: T) => Awaitable<boolean>): Logic<void, C> {
    return then(singleResolve(a), async (full, t, resolve, old, logic) => {
        if (await f(full, t)) {
            await logic.onExit?.(full);
            logic.onEvent?.(full, { type: 'update' }, old);
        } else {
            resolve();
        }
    })
}

export function forward<K, A, B>(a: Logic<B | null, A>, state: K): Logic<void | Next<K, B>, A> {
    return then(a, (_, b, resolve) => resolve(b !== null ? { state, context: b } : undefined));
}

