"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readLogic = void 0;
const card_1 = require("../../util/card");
const message_1 = require("../../util/message");
const cah_1 = require("./cah");
function message({ ctx, players }, player) {
    const prompt = (0, cah_1.getBlackCard)(ctx.prompt);
    const blanks = (0, card_1.countBlanks)(prompt);
    const answers = ctx.shuffle.map((p, i) => {
        let answers;
        if (ctx.quiplash) {
            answers = ctx.playing[p];
        }
        else if (ctx.playing[p] === 'double') {
            answers = ctx.doubleornothing[p].cards.map(cah_1.getWhiteCard);
            const missing = blanks - answers.length;
            for (let i = 0; i < missing; i++) {
                answers.push(answers[i]);
            }
        }
        else {
            answers = ctx.playing[p]
                .map(i => (0, cah_1.getWhiteCard)(ctx.hand[p][i]));
        }
        let answer = prompt;
        if (answer.indexOf("_") === -1) {
            answer = (0, card_1.bolden)(answers.join(' '));
        }
        else {
            answer = (0, card_1.fillBlanks)(answer, answers);
        }
        return `\`${i + 1}.\` ${answer}`;
    }).join('\n');
    const message = `Card Czar: ${players[ctx.czar]}\n\n> ${(0, cah_1.getBlackCard)(ctx.prompt)}\n\n${answers}`;
    const components = [];
    if (players[ctx.czar] === player) {
        components.push(...(0, message_1.createButtonGrid)(ctx.shuffle.length, i => ({
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
                    }] }],
        components,
        forceList: true,
    };
}
exports.readLogic = {
    async onExit({ game, players }) {
        await game.closeMessage(players);
    },
    onEvent(full, event, resolve) {
        const { ctx, game, players } = full;
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
                    const prompt = (0, cah_1.getBlackCard)(ctx.prompt);
                    const blanks = (0, card_1.countBlanks)(prompt);
                    const winner = ctx.shuffle[parseInt(i.customId.substring(7))];
                    let answers;
                    if (ctx.quiplash) {
                        answers = ctx.playing[winner];
                    }
                    else if (ctx.playing[winner] === 'double') {
                        answers = ctx.doubleornothing[winner].cards.map(cah_1.getWhiteCard);
                        const missing = blanks - answers.length;
                        for (let i = 0; i < missing; i++) {
                            answers.push(answers[i]);
                        }
                    }
                    else {
                        answers = ctx.playing[winner]
                            .map(i => (0, cah_1.getWhiteCard)(ctx.hand[winner][i]));
                    }
                    const answer = `> ${(0, card_1.fillBlanks)(prompt, answers)}`;
                    function serializePlayer(id) {
                        return id === cah_1.randoId ? '`Rando Cardrissian`' : `<@${id}>`;
                    }
                    // award / lose points
                    ctx.points[winner] += 1;
                    if (!ctx.quiplash)
                        for (const [player, playing] of Object.entries(ctx.playing)) {
                            if (playing === 'double' && player !== winner) {
                                ctx.points[player] -= 1 + ctx.doubleornothing[player].amount;
                            }
                        }
                    const fields = [{
                            name: 'Round winner',
                            value: `${serializePlayer(winner)}\n\n${answer}`,
                        }, {
                            name: 'Points',
                            value: (0, cah_1.getPointsList)(players, ctx.points, ctx.maxPoints),
                        }];
                    if (!ctx.quiplash) {
                        const risks = Object.entries(ctx.playing)
                            .filter(([player, playing]) => playing === 'double' && player !== winner)
                            .map(([player, _]) => `${serializePlayer(player)} lost ${ctx.doubleornothing[player].amount ? (1 + ctx.doubleornothing[player].amount) + ' points' : '1 point'}`)
                            .join('\n');
                        if (risks)
                            fields.push({ name: 'Risks taken', value: risks });
                    }
                    // continue
                    if (!ctx.quiplash) {
                        ctx.lastWinner = winner;
                    }
                    game.send(players, { embeds: [{ fields }] });
                    game.closeMessage(players, undefined, i).then(resolve);
                }
                break;
        }
    }
};
