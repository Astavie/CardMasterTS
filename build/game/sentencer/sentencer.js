"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.writingTelephone = void 0;
const card_1 = require("../../util/card");
const logic_1 = require("../logic");
function message(ctx) {
    return {
        embeds: [{ fields: [{
                        name: ctx.prompt,
                        value: `${ctx.description}${ctx.previous ? '\n\n> ' + ctx.previous : ''}`,
                    }, {
                        name: 'Answer',
                        value: `${ctx.current ? '> ' + ctx.current + '\n\n' : ''}*Type your sentence below.*`
                    }] }],
        components: [{
                type: 'ACTION_ROW',
                components: [{
                        type: 'BUTTON',
                        style: ctx.current ? 'PRIMARY' : 'SECONDARY',
                        label: 'Cancel',
                        customId: 'cancel',
                        disabled: !ctx.current,
                    }]
            }],
    };
}
const writing = {
    async onExit({ game, players }) {
        await game.closeMessage(players);
    },
    async onEvent({ game, ctx, players }, event, resolve) {
        switch (event.type) {
            case 'update':
                game.updateMessage(players, message(ctx), undefined, false);
                break;
            case 'interaction':
                switch (event.interaction.customId) {
                    case 'cancel':
                        delete ctx.current;
                        game.updateMessage(players, message(ctx), event.interaction, false);
                        resolve(null);
                        break;
                }
                break;
            case 'dm':
                ctx.current = (0, card_1.escapeDiscord)(event.message.content);
                await game.updateMessage(players, message(ctx), undefined, false);
                resolve(ctx.current);
                break;
        }
    }
};
exports.writingTelephone = (0, logic_1.telephone)(writing, (_, players) => players, (ctx, _, previous, current) => ({
    ...ctx,
    previous,
    current,
}));
