import { Awaitable } from "@discordjs/builders";
import { CommandInteraction, MessageComponentInteraction, ModalSubmitInteraction, User } from "discord.js";
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
}

export type Logic<T, C> = {
    onEvent?(full: FullContext<C>, event: Event, resolve: Resolve<T>): void,
    onExit?(full: FullContext<C>): Awaitable<void>,
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

    async onResolve(full: FullContext<KeyValuePairOf<S>>, resolve: Resolve<T>, t: T | KeyValuePairOf<S>) {
        if (t && 'state' in t) {
            const { ctx, players, game } = full;
            await this.map[ctx.state].onExit?.({ ctx: ctx.context, players, game });
            ctx.state = t.state;
            ctx.context = t.context;
            this.map[ctx.state].onEvent?.({ ctx: ctx.context, players, game }, { type: 'update' }, t => this.onResolve(full, resolve, t));
        } else {
            resolve(t);
        }
    }

    onEvent(full: FullContext<KeyValuePairOf<S>>, event: Event, resolve: Resolve<T>): void {
        const { ctx, players, game } = full;
        this.map[ctx.state].onEvent?.({ ctx: ctx.context, players, game }, event, t => this.onResolve(full, resolve, t));
    }

    onExit(full: FullContext<KeyValuePairOf<S>>) {
        const { ctx, players, game } = full;
        return this.map[ctx.state].onExit?.({ ctx: ctx.context, players, game });
    }

}

export type PlayerContext<T, A, B> = {
    global: A,
    player: {
        context: B,
        output?: T,
    },
    count: number,
}

export type ParallelContext<T, A, B> = {
    global: A,
    player: {[key:string]: {
        context: B,
        output?: T,
    }}
};

export function filter<T, C>(logic: Logic<T, C>, filter: (full: FullContext<C>) => User[]): Logic<T, C> {
    return {
        onEvent: logic.onEvent && ((full, event, resolve) => logic.onEvent!({...full, players: filter(full)}, event, resolve)),
        onExit:  logic.onExit  && ((full)                 => logic.onExit !({...full, players: filter(full)})),
    }
}

export function parallel<T, A, B>(logic: Logic<unknown, PlayerContext<T, A, B>>): Logic<{[key:string]:T}, ParallelContext<T, A, B>> {
    
    function getContext(ctx: ParallelContext<T, A, B>, player: User): PlayerContext<T, A, B> {
        return {
            global: ctx.global,
            player: ctx.player[player.id],
            count: Object.values(ctx.player).filter(p => p.output !== undefined).length,
        }
    }

    function onResolve(full: FullContext<ParallelContext<T, A, B>>, resolve: Resolve<{[key:string]:T}>) {
        const outputs: {[key:string]:T} = {}
        let canResolve = true;
        for (const player of full.players) {
            const pctx = getContext(full.ctx, player);
            logic.onEvent?.({ ctx: pctx, players: [player], game: full.game }, { type: 'update' }, () => onResolve(full, resolve));

            if (pctx.player.output === undefined) {
                canResolve = false;
            } else {
                outputs[player.id] = pctx.player.output;
            }
        }
        if (canResolve) {
            resolve(outputs);
        }
    }

    return {
        onEvent(full, event, resolve) {
            switch (event.type) {
                case 'start':
                case 'update':
                    for (const player of full.players) {
                        const pctx = getContext(full.ctx, player);
                        logic.onEvent?.({ ctx: pctx, players: [player], game: full.game }, event, () => onResolve(full, resolve));
                    }
                    break;
                case 'interaction':
                    const player = event.interaction.user;
                    if (full.players.includes(player)) {
                        const pctx = getContext(full.ctx, player);
                        logic.onEvent?.({ ctx: pctx, players: [player], game: full.game }, event, () => onResolve(full, resolve));
                    }
                    break;
                case 'add':
                    onResolve(full, resolve);
                    break;
                case 'remove':
                    delete full.ctx.player[event.player.id];
                    onResolve(full, resolve);
                    break;
            }
        },
        onExit: logic.onExit && (async ({ctx, players, game}) => {
            const promises: Awaitable<void>[] = [];
            for (const player of players) {
                const pctx = getContext(ctx, player);
                promises.push(logic.onExit!({ ctx: pctx, players: [player], game }));
            }
            await Promise.all(promises);
        }),
    }
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

export function then<A, B, C>(a: Logic<A, C>, f: (full: FullContext<C>, a: A) => Awaitable<B>): Logic<B, C> {
    return {
        onEvent: a.onEvent && ((full, event, resolve) => {
            a.onEvent!(full, event, async t => resolve(await f(full, t)))
        }),
        onExit: a.onExit,
    };
}

export function next<K, C>(a: Logic<unknown, C>, state: K): Logic<KeyValuePair<K, C>, C> {
    return then(a, ({ctx}) => ({ state, context: ctx }));
}

export function loop<C>(a: Logic<boolean, C>): Logic<void, C> {

    async function onResolve(full: FullContext<C>, ret: boolean, resolve: Resolve<void>) {
        if (ret) {
            // a.onExit?.(full);
            a.onEvent!(full, { type: 'update' }, t => onResolve(full, t, resolve))
        } else {
            resolve();
        }
    }

    return {
        onEvent: a.onEvent && ((full, event, resolve) => {
            a.onEvent!(full, event, t => onResolve(full, t, resolve))
        }),
        onExit: a.onExit,
    }
}

export function forward<K, A, B>(a: Logic<B | null, A>, state: K): Logic<void | KeyValuePair<K, B>, A> {
    return then(a, (_, b) => {
        if (b !== null) return { state, context: b };
    });
}

