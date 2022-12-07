"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SetupLogic = void 0;
function defaultMessageGenerator({ players }) {
    return {
        fields: [{
                name: 'Players',
                value: players.map(p => p.toString()).join('\n') || '*None.*'
            }]
    };
}
class SetupLogic {
    args;
    generator;
    starter;
    constructor(args, starter, generator = defaultMessageGenerator) {
        this.args = args;
        this.generator = generator;
        this.starter = starter;
    }
    message(full) {
        const embeds = [this.generator(full)];
        const components = [];
        const ctx = full.ctx;
        for (const arg of this.args) {
            const row = {
                type: 'ACTION_ROW',
                components: [{
                        type: 'BUTTON',
                        customId: `_${arg.name}_`,
                        label: arg.name,
                        style: 'PRIMARY',
                        disabled: true,
                    }],
            };
            components.push(row);
            switch (arg.type) {
                case 'flags':
                    arg.values.forEach((value, i) => row.components.push({
                        type: 'BUTTON',
                        customId: `_${arg.name}_${i}`,
                        label: value,
                        style: ctx[arg.name][i] ? 'SUCCESS' : 'SECONDARY',
                    }));
                    break;
                case 'choice':
                    row.components = [{
                            type: 'SELECT_MENU',
                            customId: `_${arg.name}_`,
                            minValues: arg.min,
                            maxValues: Math.min(arg.values.length, arg.max),
                            placeholder: arg.name,
                            options: arg.values.map((value, i) => ({
                                default: ctx[arg.name].includes(i),
                                value: i.toString(),
                                ...value,
                            })),
                        }];
                    break;
                case 'number':
                    row.components.push({
                        type: 'BUTTON',
                        style: 'PRIMARY',
                        label: '◀',
                        customId: `_${arg.name}_dec`,
                        disabled: ctx[arg.name] <= arg.min,
                    }, {
                        type: 'BUTTON',
                        style: 'SECONDARY',
                        label: ctx[arg.name].toString(),
                        customId: `_${arg.name}_def`,
                    }, {
                        type: 'BUTTON',
                        style: 'PRIMARY',
                        label: '▶',
                        customId: `_${arg.name}_inc`,
                        disabled: ctx[arg.name] >= arg.max,
                    });
                    break;
            }
        }
        components.push({
            type: 'ACTION_ROW',
            components: [{
                    type: 'BUTTON',
                    customId: '_join',
                    label: 'Join',
                    style: 'SUCCESS',
                }, {
                    type: 'BUTTON',
                    customId: '_leave',
                    label: 'Leave',
                    style: 'DANGER',
                }, {
                    type: 'BUTTON',
                    customId: '_start',
                    label: 'Start',
                    style: 'PRIMARY',
                }, {
                    type: 'BUTTON',
                    customId: '_close',
                    label: 'Close',
                    style: 'PRIMARY',
                }],
        });
        return {
            embeds,
            components,
            forceList: false,
        };
    }
    onEvent(_full, event, resolve) {
        const full = _full;
        const { ctx, game } = full;
        switch (event.type) {
            case 'start':
                for (const arg of this.args) {
                    if (!ctx[arg.name])
                        ctx[arg.name] = arg.default;
                }
                game.updateLobby(this.message(full), event.interaction);
                break;
            case 'interaction':
                switch (event.interaction.customId) {
                    case '_close':
                        game.closeLobby(undefined, event.interaction);
                        resolve(null);
                        return;
                    case '_join':
                        if (game.addPlayer(event.interaction.user)) {
                            game.updateLobby(this.message(full), event.interaction);
                        }
                        else {
                            event.interaction.reply({
                                content: 'You have already joined!',
                                ephemeral: true
                            });
                        }
                        return;
                    case '_leave':
                        if (game.removePlayer(event.interaction.user)) {
                            game.updateLobby(this.message(full), event.interaction);
                        }
                        else {
                            event.interaction.reply({ content: 'You have not even joined!', ephemeral: true });
                        }
                        return;
                    case '_start':
                        (async () => {
                            const t = await this.starter(full, event.interaction);
                            if (t !== null)
                                resolve(t);
                        })();
                        return;
                }
                const arg = this.args.find(arg => event.interaction.customId.startsWith(`_${arg.name}_`));
                if (!arg)
                    return;
                switch (arg.type) {
                    case 'flags':
                        const num = parseInt(event.interaction.customId.substring(arg.name.length + 2));
                        const flags = ctx[arg.name];
                        flags[num] = !flags[num];
                        break;
                    case 'number':
                        const end = event.interaction.customId.substring(event.interaction.customId.length - 3);
                        switch (end) {
                            case 'inc':
                                if (ctx[arg.name] < arg.max)
                                    ctx[arg.name] += 1;
                                break;
                            case 'dec':
                                if (ctx[arg.name] > arg.min)
                                    ctx[arg.name] -= 1;
                                break;
                            case 'def':
                                ctx[arg.name] = arg.default;
                                break;
                        }
                        break;
                    case 'choice':
                        ctx[arg.name] = event.interaction.values.map(value => parseInt(value));
                        break;
                }
                game.updateLobby(this.message(full));
                break;
        }
    }
}
exports.SetupLogic = SetupLogic;
