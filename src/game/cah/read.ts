import { BaseMessageComponentOptions, EmbedFieldData, MessageActionRowComponentResolvable, MessageActionRowOptions } from "discord.js";
import { bolden, fillBlanks } from "../../util/card";
import { GameInstance, shuffle } from "../game";
import { addPlayer, CAH, CAHContext, CAHState, getPointsList, randoId, removePlayer } from "./cah";
import { setupHAND } from "./hand";

export function displayREAD(game: GameInstance<CAHContext, CAHState>) {
    // Shuffle players
    game.context.shuffle = game.players.filter((p, index) => game.context.czar !== index && !game.context.players[p.id].playing.includes(null)).map(p => p.id);
    if (game.context.flags[0]) game.context.shuffle.push(randoId);
    shuffle(game.context.shuffle);

    game.activeMessage.updateAll();
    game.sendPrivate();
}

export function resumeREAD(game: GameInstance<CAHContext, CAHState>) {
    // Display
    let prompt = `> ${game.context.prompt!}`
    prompt = `Card Czar: <@${game.players[game.context.czar].id}>\n\n` + prompt;

    game.activeMessage.message = channel => {
        let message = prompt;

        let answers = game.context.shuffle.map((p, i) => {
            const player = game.context.players[p];
            let answer = game.context.prompt as string;
    
            if (answer.indexOf("_") === -1) {
                answer = bolden(player.playing.map(c => typeof c !== 'number' ? c : player.hand[c]).join(" "));
            } else {
                answer = fillBlanks(answer, player.playing.map(i => typeof i !== 'number' ? i : player.hand[i]));
            }
    
            return `\`${i + 1}.\` ${answer}`;
        }).join("\n");

        message += "\n\n" + answers;

        let components: (Required<BaseMessageComponentOptions> & MessageActionRowOptions)[] = [];

        if (channel.type === "DM" && game.players[game.context.czar] === channel.recipient) {
            let answer = 0;
            while (answer < game.context.shuffle.length) {
                const row: MessageActionRowComponentResolvable[] = [];
                for (let i = 0; i < 5; i++) {
                    row.push({
                        type: "BUTTON",
                        style: "PRIMARY",
                        label: (answer + 1).toString(),
                        customId: `answer_${answer}`,
                    });

                    answer++;
                    if (answer >= game.context.shuffle.length) break;
                }
                components.push({
                    type: "ACTION_ROW",
                    components: row
                });
            }
        }

        const fields: EmbedFieldData[] = [{
            name: "Prompt",
            value: message
        }];

        return {
            embeds: [{
                color: CAH.color,
                title: CAH.name,
                fields: fields
            }],
            components: components
        }
    };

    for (let index = 0; index < game.players.length + (game.context.flags[0] ? 1 : 0); index++) {
        game.onButton(`answer_${index}`, (i): Promise<CAHState> | null => {
            // Get winner
            const winner = game.context.players[game.context.shuffle[index]];
            let answer = game.context.prompt as string;
    
            if (answer.indexOf("_") === -1) {
                const bold = bolden(winner.playing.map(c => typeof c !== 'number' ? c : winner.hand[c]).join(" "));
                answer = "> " + answer + "\n> " + bold;
            } else {
                answer = "> " + fillBlanks(answer, winner.playing.map(i => typeof i !== 'number' ? i : winner.hand[i]));
            }
            
            winner.points += 1;

            // Send messages
            game.activeMessage.endAll(i);
            game.resetControls();

            return game.sendAll(() => ({
                embeds: [{
                    color: CAH.color,
                    fields: [{
                        name: 'Round Winner',
                        value: `${game.context.shuffle[index] === randoId ? "`Rando Cardrissian`" : `<@${game.context.shuffle[index]}>`}\n${answer}`
                    },{
                        name: 'Points',
                        value: getPointsList(game.players, game.context.flags[0], game.context.players, game.context.maxPoints)
                    }]
                }]
            })).then(() => {
                // Remove played cards
                for (const player of Object.values(game.context.players)) {
                    player.hand = player.hand.filter((_, i) => !player.playing.includes(i));
                }

                // Check points
                if (winner.points >= game.context.maxPoints) {
                    return "END";
                } else {
                    return setupHAND(game);
                }
            });
        });
    }

    // Join and leave logic
    game.join = (i, player) => addPlayer(i, game, player);
    game.leave = (i, player, index) => removePlayer(i, game, player, index);
    game.minPlayers = () => 2;
    game.maxPlayers = () => 20;
    game.addLeaveButton();
    game.addSupportedLogic();
}
