import { APIActionRowComponent, APIEmbedField, APIMessageActionRowComponent, ButtonStyle, ComponentType, User } from 'discord.js';
import { bolden, fillBlanks } from '../../util/card';
import { createButtonGrid, MessageOptions } from '../../util/message';
import { Game, Logic } from '../logic';
import { countBlanks, getBlackCard, getPointsList, getWhiteCard, randoId, RoundContext } from './cah';

function message(game: Game, players: User[], ctx: RoundContext, player: User | null): MessageOptions {
    const prompt = getBlackCard(game, ctx.prompt);
    const blanks = countBlanks(game, ctx.prompt);

    const answers = ctx.shuffle.map((p, i) => {
        let answers: string[];
        if (ctx.quiplash) {
            answers = ctx.playing[p] as string[];
        } else if (ctx.playing[p] === 'double') {
            answers = ctx.doubleornothing![p].cards.map(c => getWhiteCard(game, c));
            const missing = blanks - answers.length;
            for (let i = 0; i < missing; i++) {
                answers.push(answers[i]);
            }
        } else {
            answers = (ctx.playing[p] as (number | string)[]).map(i => getWhiteCard(game, ctx.hand[p][i!]));
        }

        let answer = prompt;
        if (answer.indexOf("_") === -1) {
            answer = bolden(answers.join(' '));
        } else {
            answer = fillBlanks(answer, answers);
        }

        return `\`${i + 1}.\` ${answer}`;
    }).join('\n');

    const message = `Card Czar: ${players[ctx.czar]}\n\n> ${getBlackCard(game, ctx.prompt)}\n\n${answers}`;
    
    const components: APIActionRowComponent<APIMessageActionRowComponent>[] = [];
    if (players[ctx.czar] === player) {
        components.push(...createButtonGrid(ctx.shuffle.length, i => ({
            style: ButtonStyle.Primary,
            label: (i + 1).toString(),
            custom_id: `answer_${i}`,
        })));
    }
    if (player) {
        components.push({
            type: ComponentType.ActionRow,
            components: [{
                type: ComponentType.Button,
                custom_id: '_leave',
                style: ButtonStyle.Danger,
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
    };
}

export const readLogic: Logic<true, RoundContext> = function* (game, players, ctx) {

    game.updateMessage(players, p => message(game, players, ctx, p));

    while (true) {
        const event = yield;

        switch (event.type) {
        case 'add':
        case 'remove':
            if (players.length > 2) {
                game.updateMessage(players, p => message(game, players, ctx, p), event.interaction);
            }
        break;
        case 'interaction':
            const i = event.interaction;
            if (i.customId.startsWith('answer_')) {
                const prompt = getBlackCard(game, ctx.prompt);
                const blanks = countBlanks(game, ctx.prompt);
                const winner = ctx.shuffle[parseInt(i.customId.substring(7))];
            
                let answers: string[];
                if (ctx.quiplash) {
                    answers = ctx.playing[winner] as string[];
                } else if (ctx.playing[winner] === 'double') {
                    answers = ctx.doubleornothing![winner].cards.map(c => getWhiteCard(game, c));
                    const missing = blanks - answers.length;
                    for (let i = 0; i < missing; i++) {
                        answers.push(answers[i]);
                    }
                } else {
                    answers = (ctx.playing[winner] as (number | null)[]).map(i => getWhiteCard(game, ctx.hand[winner][i!]));
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
                
                const fields: APIEmbedField[] = [{
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
                game.closeMessage(players, undefined, i);
                game.send(players, { embeds: [{ fields }]});
                return true;
            }
        break;
        }
    }
}
