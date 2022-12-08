import { EmbedFieldData, MessageActionRowOptions, User } from 'discord.js';
import { bolden, countBlanks, fillBlanks } from '../../util/card';
import { createButtonGrid, MessageOptions } from '../../util/message';
import { FullContext, Logic } from '../logic';
import { getBlackCard, getPointsList, getWhiteCard, randoId, RoundContext } from './cah';

async function message({ ctx, players, guildid }: FullContext<RoundContext>, player: User | null): Promise<MessageOptions> {
    const prompt = await getBlackCard(guildid, ctx.prompt);
    const blanks = countBlanks(prompt);

    const answers = (await Promise.all(ctx.shuffle.map(async (p, i) => {
        let answers: string[];
        if (ctx.quiplash) {
            answers = ctx.playing[p] as string[];
        } else if (ctx.playing[p] === 'double') {
            answers = await Promise.all(ctx.doubleornothing![p].cards.map(c => getWhiteCard(guildid, c)));
            const missing = blanks - answers.length;
            for (let i = 0; i < missing; i++) {
                answers.push(answers[i]);
            }
        } else {
            answers = await Promise.all((ctx.playing[p] as (number | string)[])
                .map(i => getWhiteCard(guildid, ctx.hand[p][i!])));
        }

        let answer = prompt;
        if (answer.indexOf("_") === -1) {
            answer = bolden(answers.join(' '));
        } else {
            answer = fillBlanks(answer, answers);
        }

        return `\`${i + 1}.\` ${answer}`;
    }))).join('\n');

    const message = `Card Czar: ${players[ctx.czar]}\n\n> ${await getBlackCard(guildid, ctx.prompt)}\n\n${answers}`;
    
    const components: (Required<MessageActionRowOptions>)[] = [];
    if (players[ctx.czar] === player) {
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
    async onExit({ game, players }: FullContext<RoundContext>) {
        await game.closeMessage(players);
    },
    async onEvent(full, event, resolve) {
        const { ctx, game, players, guildid } = full;
        switch (event.type) {
        case 'update':
            game.updateMessage(players, p => message(full, p));
        break;
        case 'add':
        case 'remove':
            if (players.length > 2) {
                game.updateMessage(players, p => message(full, p), event.interaction);
            }
        break;
        case 'interaction':
            const i = event.interaction;
            if (i.customId.startsWith('answer_')) {
                const prompt = await getBlackCard(guildid, ctx.prompt);
                const blanks = countBlanks(prompt);
                const winner = ctx.shuffle[parseInt(i.customId.substring(7))];
            
                let answers: string[];
                if (ctx.quiplash) {
                    answers = ctx.playing[winner] as string[];
                } else if (ctx.playing[winner] === 'double') {
                    answers = await Promise.all(ctx.doubleornothing![winner].cards.map(c => getWhiteCard(guildid, c)));
                    const missing = blanks - answers.length;
                    for (let i = 0; i < missing; i++) {
                        answers.push(answers[i]);
                    }
                } else {
                    answers = await Promise.all((ctx.playing[winner] as (number | null)[])
                        .map(i => getWhiteCard(guildid, ctx.hand[winner][i!])));
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
                    value: getPointsList(players, ctx.points, ctx.maxPoints),
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
                game.send(players, { embeds: [{ fields }]});
                game.closeMessage(players, undefined, i).then(resolve);
            }
        break;
        }
    }
}
