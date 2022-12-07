"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.forward = exports.loop = exports.next = exports.then = exports.or = exports.first = exports.all = exports.telephone = exports.singleResolve = exports.sequence = void 0;
function sequence(logicmap) {
    return then({
        onEvent(full, event, resolve) {
            logicmap[full.ctx.state].onEvent?.({ ...full, ctx: full.ctx.context }, event, resolve);
        },
        onExit(full) {
            return logicmap[full.ctx.state].onExit?.({ ...full, ctx: full.ctx.context });
        },
    }, async (full, t, resolve, old, logic) => {
        if (t && 'state' in t) {
            await logic.onExit?.(full);
            full.ctx.context = t.context;
            full.ctx.state = t.state;
            logic.onEvent?.(full, { type: 'update' }, old);
        }
        else {
            resolve(t);
        }
    });
}
exports.sequence = sequence;
function singleResolve(logic) {
    return {
        onEvent: logic.onEvent && ((full, event, resolve) => {
            if (!full.ctx._resolve)
                full.ctx._resolve = [];
            const token = full.ctx._resolve;
            logic.onEvent(full, event, t => {
                if (token.length)
                    return;
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
exports.singleResolve = singleResolve;
function telephone(logic, rounds, map) {
    return then(singleResolve(all(logic, (ctx_, player) => {
        const ctx = ctx_;
        const round = ctx.previous[0].length;
        const previous = round ? ctx.previous[ctx.shuffle.indexOf(player.id)][round - 1] : undefined;
        const current = ctx.results[player.id];
        return map(ctx.context, round, previous, current);
    })), async (full, t, resolve, old, logic) => {
        const round = full.ctx.previous[0].length;
        const max = rounds(full.ctx.context, full.players.length);
        if (round + 1 >= max) {
            for (let i = 0; i < full.ctx.shuffle.length; i++) {
                const player = full.ctx.shuffle[i];
                full.ctx.previous[i].push(t[player]);
            }
            full.ctx.results = {};
            // calculate final result
            const final = full.ctx.shuffle.map(() => []);
            for (let i = round + 1; i >= 0; i--) {
                for (let j = 0; j < full.ctx.shuffle.length; j++) {
                    final[j].unshift([full.ctx.shuffle[j], full.ctx.previous[j][i]]);
                }
                // move players back
                full.ctx.shuffle.push(full.ctx.shuffle.shift());
            }
            // resolve
            resolve(final);
        }
        else {
            await logic.onExit?.(full);
            for (let i = 0; i < full.ctx.shuffle.length; i++) {
                const player = full.ctx.shuffle[i];
                full.ctx.previous[i].push(t[player]);
            }
            // move players forward
            full.ctx.results = {};
            full.ctx.shuffle.unshift(full.ctx.shuffle.pop());
            // continue
            logic.onEvent?.(full, { type: 'update' }, old);
        }
    });
}
exports.telephone = telephone;
function all(logic, map) {
    return then(or({
        onEvent(full, event) {
            if (event.type === 'remove') {
                delete full.ctx.results[event.player.id];
            }
        }
    }, first(logic, map)), (full, [id, t], resolve, old, logic) => {
        if (t === null) {
            delete full.ctx.results[id];
        }
        else {
            full.ctx.results[id] = t;
        }
        if (Object.keys(full.ctx.results).length === full.players.length) {
            resolve(full.ctx.results);
        }
        else {
            logic.onEvent?.({ ...full, players: full.players.filter(p => p.id !== id) }, { type: 'update' }, old);
        }
    });
}
exports.all = all;
function first(logic, map) {
    const l2 = then(logic, (full, t, resolve) => resolve([full.players[0].id, t]));
    return {
        onEvent: l2.onEvent && ((full, event, resolve) => {
            switch (event.type) {
                case 'start':
                case 'update':
                    for (const player of full.players) {
                        const ctx = map(full.ctx, player);
                        l2.onEvent({ ...full, players: [player], ctx }, event, resolve);
                    }
                    break;
                case 'interaction':
                    {
                        const ctx = map(full.ctx, event.interaction.user);
                        l2.onEvent({ ...full, players: [event.interaction.user], ctx }, event, resolve);
                    }
                    break;
                case 'dm':
                    {
                        const ctx = map(full.ctx, event.message.author);
                        l2.onEvent({ ...full, players: [event.message.author], ctx }, event, resolve);
                    }
                    break;
                case 'add':
                    {
                        const ctx = map(full.ctx, event.player);
                        l2.onEvent({ ...full, players: [event.player], ctx }, { type: 'update' }, resolve);
                    }
                    break;
            }
        }),
        onExit: l2.onExit && (async (full) => {
            const promises = [];
            for (const player of full.players) {
                const ctx = map(full.ctx, player);
                promises.push(l2.onExit({ ...full, players: [player], ctx }));
            }
            await Promise.all(promises);
        }),
    };
}
exports.first = first;
function or(...as) {
    const es = as.filter(a => a.onEvent);
    const rs = as.filter(a => a.onExit);
    return {
        onEvent() {
            for (const f of es)
                f.onEvent(...arguments);
        },
        async onExit() {
            const a = [];
            for (const f of rs)
                a.push(f.onExit(...arguments));
            await Promise.all(a);
        },
    };
}
exports.or = or;
function then(a, f) {
    const old = (full, t, resolve) => f(full, t, resolve, t => old(full, t, resolve), a);
    return {
        onEvent: a.onEvent && ((full, event, resolve) => {
            a.onEvent(full, event, t => old(full, t, resolve));
        }),
        onExit: a.onExit,
    };
}
exports.then = then;
function next(a, state) {
    return then(a, ({ ctx }, _, resolve) => resolve({ state, context: ctx }));
}
exports.next = next;
function loop(a, f) {
    return then(a, async (full, t, resolve, old, logic) => {
        if (await f(full, t)) {
            await logic.onExit?.(full);
            logic.onEvent?.(full, { type: 'update' }, old);
        }
        else {
            resolve();
        }
    });
}
exports.loop = loop;
function forward(a, state) {
    return then(a, (_, b, resolve) => resolve(b !== null ? { state, context: b } : undefined));
}
exports.forward = forward;
