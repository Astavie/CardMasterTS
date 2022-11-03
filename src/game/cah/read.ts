import { EmbedFieldData, MessageActionRowOptions, User } from 'discord.js';
import { bolden, countBlanks, fillBlanks } from '../../util/card';
import { createButtonGrid, MessageOptions } from '../../util/message';
import { Game, Logic } from '../logic';
import { getBlackCard, getPointsList, getWhiteCard, randoId, RoundContext } from './cah';

function message(ctx: RoundContext, game: Game, player: User | null): MessageOptions {
    const prompt = getBlackCard(ctx.prompt);
    const blanks = countBlanks(prompt);

    const answers = ctx.shuffle.map((p, i) => {
        let answers: string[];
        if (ctx.quiplash) {
            answers = ctx.playing[p] as string[];
        } else if (ctx.playing[p] === 'double') {
            answers = ctx.doubleornothing![p].cards.map(getWhiteCard);
            const missing = blanks - answers.length;
            for (let i = 0; i < missing; i++) {
                answers.push(answers[i]);
            }
        } else {
            answers = (ctx.playing[p] as (number | string)[])
                .map(i => getWhiteCard(ctx.hand[p][i!]));
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
    async onExit(_ctx, game) {
        await game.closeMessage();
    },
    onInteraction(ctx, game, resolve, i) {
        if (i.customId === '_join' || i.customId === '_leave') {
            if (!i.replied && game.players.length >= 2) {
                game.updateMessage(p => message(ctx, game, p), i);
            }
            return;
        }

        if (i.customId.startsWith('answer_')) {
            const prompt = getBlackCard(ctx.prompt);
            const blanks = countBlanks(prompt);
            const winner = ctx.shuffle[parseInt(i.customId.substring(7))];
        
            let answers: string[];
            if (ctx.quiplash) {
                answers = ctx.playing[winner] as string[];
            } else if (ctx.playing[winner] === 'double') {
                answers = ctx.doubleornothing![winner].cards.map(getWhiteCard);
                const missing = blanks - answers.length;
                for (let i = 0; i < missing; i++) {
                    answers.push(answers[i]);
                }
            } else {
                answers = (ctx.playing[winner] as (number | null)[])
                    .map(i => getWhiteCard(ctx.hand[winner][i!]));
            }

            const answer = `> ${fillBlanks(prompt, answers)}`;

            function serializePlayer(id: string) {
                return id === randoId ? '`Rando Cardrissian`' : `<@${id}>`;
            }

            // award / lose points
            ctx.points[winner] += 1;
            if (!ctx.quiplash) for (const [player, playing] of Object.entries(ctx.playing)) {
                if (playing === 'double' && player !== winner) {
                    ctx.points[player] -= 1 + ctx.doubleornothing![player].amount;
                }
            }
            
            const fields: EmbedFieldData[] = [{
                name: 'Round winner',
                value: `${serializePlayer(winner)}\n\n${answer}`,
            },{
                name: 'Points',
                value: getPointsList(game.players, ctx.points, ctx.maxPoints),
            }];

            if (!ctx.quiplash) {
                const risks = Object.entries(ctx.playing)
                    .filter(([player, playing]) => playing === 'double' && player !== winner)
                    .map(([player, _]) => `${serializePlayer(player)} lost ${ctx.doubleornothing![player].amount ? (1 + ctx.doubleornothing![player].amount) + ' points' : '1 point'}`)
                    .join('\n');

                if (risks) fields.push({ name: 'Risks taken', value: risks });
            }

            // continue
            if (!ctx.quiplash) {
                ctx.lastWinner = winner;
            }
            game.sendAll({ embeds: [{ fields }]});
            game.closeMessage(undefined, i).then(resolve);
        }
    },
}
