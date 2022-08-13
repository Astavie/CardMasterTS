import { BaseMessageComponentOptions, EmbedFieldData, MessageActionRowComponentResolvable, MessageActionRowOptions } from "discord.js";
import { bolden, fillBlanks } from "../../util/card";
import { GameInstance, shuffle } from "../game";
import { addPlayer, CAH, CAHAction, CAHState, getPointsList, randoId, removePlayer } from "./cah";

export async function read(game: GameInstance, state: CAHState): Promise<CAHAction> {
    return new Promise<CAHAction>(resolve => {
        // Shuffle players
        state.shuffle = game.players.filter((p, index) => state.czar !== index && !state.players[p.id].playing.includes(undefined)).map(p => p.id);
        if (state.flags[0]) state.shuffle.push(randoId);
        shuffle(state.shuffle);

        // Display
        let prompt = `> ${state.prompt!}`
        prompt = `Card Czar: <@${game.players[state.czar].id}>\n\n` + prompt;

        game.activeMessage!.message = channel => {
            let message = prompt;

            let answers = state.shuffle.map((p, i) => {
                const player = state.players[p];
                let answer = state.prompt as string;
        
                if (answer.indexOf("_") === -1) {
                    answer = bolden(player.playing.map(c => player.hand[c!]).join(" "));
                } else {
                    answer = fillBlanks(answer, player.playing.map(i => player.hand[i as number]));
                }
        
                return `\`${i + 1}.\` ${answer}`;
            }).join("\n");

            message += "\n\n" + answers;

            let components: (Required<BaseMessageComponentOptions> & MessageActionRowOptions)[] = [];

            if (channel.type === "DM" && game.players[state.czar] === channel.recipient) {
                let answer = 0;
                while (answer < state.shuffle.length) {
                    const row: MessageActionRowComponentResolvable[] = [];
                    for (let i = 0; i < 5; i++) {
                        row.push({
                            type: "BUTTON",
                            style: "PRIMARY",
                            label: (answer + 1).toString(),
                            customId: `answer_${answer}`,
                        });

                        answer++;
                        if (answer >= state.shuffle.length) break;
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


        for (let index = 0; index < state.shuffle.length; index++) {
            game.onButton(`answer_${index}`, i => {
                // Get winner
                const winner = state.players[state.shuffle[index]];
                let answer = state.prompt as string;
        
                if (answer.indexOf("_") === -1) {
                    const bold = bolden(winner.playing.map(c => winner.hand[c!]).join(" "));
                    answer = "> " + answer + "\n> " + bold;
                } else {
                    answer = "> " + fillBlanks(answer, winner.playing.map(i => winner.hand[i as number]));
                }
                
                winner.points += 1;

                // Send messages
                game.activeMessage!.endAll(i);
                game.resetControls();

                game.sendAll(() => ({
                    embeds: [{
                        color: CAH.color,
                        fields: [{
                            name: 'Round Winner',
                            value: `${state.shuffle[index] === randoId ? "`Rando Cardrissian`" : `<@${state.shuffle[index]}>`}\n${answer}`
                        },{
                            name: 'Points',
                            value: getPointsList(game.players, state.flags[0], state.players, state.maxPoints)
                        }]
                    }]
                })).then(() => {
                    // Remove played cards
                    for (const player of Object.values(state.players)) {
                        player.hand = player.hand.filter((_, i) => !player.playing.includes(i));
                    }

                    // Check points
                    if (winner.points >= state.maxPoints) {
                        resolve(CAHAction.End);
                    } else {
                        resolve(CAHAction.Continue);
                    }
                });
            });
        }

        // Join and leave logic
        game.join = (i, player) => addPlayer(i, game, player, state, resolve);
        game.leave = (i, player, index) => removePlayer(i, game, player, index, state, resolve);

        game.addLeaveButton();
        game.addSupportedLogic();
        
        game.activeMessage!.updateAll();
        game.sendPrivate();
    });
}
