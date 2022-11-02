import { MessageActionRowOptions, User } from 'discord.js';
import { bolden, fillBlanks } from '../../util/card';
import { createButtonGrid, MessageOptions } from '../../util/message';
import { Game, Logic } from '../logic';
import { getBlackCard, getPointsList, getWhiteCard, randoId, RoundContext } from './cah';

function message(ctx: RoundContext, game: Game, player: User | null): MessageOptions {
    const prompt = getBlackCard(ctx.prompt);

    const answers = ctx.shuffle.map((p, i) => {
        let answers: string[];
        if (ctx.quiplash) {
            answers = ctx.playing[p] as string[];
        } else {
            answers = ctx.playing[p].map(i => getWhiteCard(ctx.hand[p][i!]));
        }

        let answer = prompt;
        if (answer.indexOf("_") === -1) {
            answer = bolden(answers.join(' '));
        } else {
            answer = fillBlanks(answer, answers);
        }

        return `\`${i + 1}.\` ${answer}`;
    }).join('\n');

    const message = `Card Czar: ${game.players[ctx.czar]}\n\n> ${getBlackCard(ctx.prompt)}\n\n${answers}`;
    
    const components: (Required<MessageActionRowOptions>)[] = [];
    if (game.players[ctx.czar] === player) {
        components.push(...createButtonGrid(ctx.shuffle.length, i => ({
            style: 'PRIMARY',
            label: (i + 1).toString(),
            customId: `answer_${i}`,
        })));
    }
    if (player) {
        components.push({
            type: 'ACTION_ROW',
            components: [{
                type: 'BUTTON',
                customId: '_leave',
                style: 'DANGER',
                label: 'Leave',
            }]
        });
    }

    return {
        embeds: [{ fields: [{
            name: 'Prompt',
            value: message,
        }]}],
        components,
        forceList: true,
    };
}

export const readLogic: Logic<void, RoundContext> = {
    onEnter(ctx, game) {
        game.updateMessage(p => message(ctx, game, p));
    },
    onExit(_ctx, game) {
        game.closeMessage();
    },
    onInteraction(ctx, game, resolve, i) {
        if (i.customId === '_join' || i.customId === '_leave') {
            if (!i.replied) {
                game.updateMessage(p => message(ctx, game, p), i);
            }
            return;
        }

        if (i.customId.startsWith('answer_')) {
            const prompt = getBlackCard(ctx.prompt);
            const winner = ctx.shuffle[parseInt(i.customId.substring(7))];
        
            let answers: string[];
            if (ctx.quiplash) {
                answers = ctx.playing[winner] as string[];
            } else {
                answers = ctx.playing[winner].map(i => getWhiteCard(ctx.hand[winner][i!]));
            }

            const answer = fillBlanks(prompt, answers);
            ctx.points[winner] += 1;

            // Send winner
            game.sendAll({ embeds: [{ fields: [{
                name: 'Round Winner',
                value: `${winner === randoId ? '`Rando Cardrissian`' : `<@${winner}>`}\n${answer}`,
            },{
                name: 'Points',
                value: getPointsList(game.players, ctx.points, ctx.maxPoints),
            }]}]});
            game.closeMessage(undefined, i).then(resolve);
        }
    },
}
