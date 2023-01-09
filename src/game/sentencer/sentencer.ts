import { ButtonStyle, ComponentType } from "discord.js";
import { escapeDiscord } from "../../util/card";
import { MessageOptions } from "../../util/message";
import { Logic, telephone } from "../logic";

type WritingGlobals = {
    prompt: string,
    description: string,
}

type WritingContext = WritingGlobals & {
    current?: string,
    previous?: string,
}

function message(ctx: WritingContext): MessageOptions {
    return {
        embeds: [{ fields: [{
            name: ctx.prompt,
            value: `${ctx.description}${ctx.previous ? '\n\n> ' + ctx.previous : ''}`,
        }, {
            name: 'Answer',
            value: `${ctx.current ? '> ' + ctx.current + '\n\n' : ''}*Type your sentence below.*`
        }]}],
        components: [{
            type: ComponentType.ActionRow,
            components: [{
                type: ComponentType.Button,
                style: ctx.current ? ButtonStyle.Primary : ButtonStyle.Secondary,
                label: 'Cancel',
                customId: 'cancel',
                disabled: !ctx.current,
            }]
        }],
    };
}

const writing: Logic<string | null, WritingContext> = {
    async onExit({ game, players }) {
        await game.closeMessage(players);
    },
    async onEvent({ game, ctx, players }, event, resolve) {
        switch (event.type) {
        case 'update':
            await game.updateMessage(players, message(ctx), undefined, false);
        break;
        case 'interaction':
            switch (event.interaction.customId) {
            case 'cancel':
                delete ctx.current;
                await game.updateMessage(players, message(ctx), event.interaction, false);
                await resolve(null);
            break;
            }
        break;
        case 'dm':
            ctx.current = escapeDiscord(event.message.content);
            await game.updateMessage(players, message(ctx), undefined, false);
            await resolve(ctx.current);
        break;
        }
    }
}

export const writingTelephone = telephone(writing, (_, players) => players, (ctx: WritingGlobals, _, previous, current) => ({
    ...ctx,
    previous,
    current,
}));

