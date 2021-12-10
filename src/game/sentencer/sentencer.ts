import { ButtonInteraction, GuildEmoji, Message } from "discord.js";
import { Game, GameInstance, MessageController, shuffle } from "../game";
import { setup } from "./setup";

const context = () => {
    return {
        stories: []  as string[][],
        round: 0,

        rounds: 6,
        emotes: false,

        emotelist: [] as string[],
        emotepot: [] as string[],
        storymotes: [] as string[][],

        currentStory: -1,
        currentSentence: 0,

        portion: ""
    };
}

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export type SRContext = ReturnType<typeof context>;
export type SRStates = "emotes" | "story" | "display";

export const Sentencer: Game<SRContext, SRStates> = {

    name: "Sentencer",
    context: context,

    onStart: setup,

    states: {
        "emotes": async game => {
            const message = await game.channel.send({ embeds: [{
                color: "#00BB00",
                fields: [{
                    name: "Create a pool of Emoji!",
                    value: "React with any regular Emoji or custom Emoji from this server.\nYou have 60 seconds."
                }]
            }]});

            await sleep(60 * 1000);

            const emoji = Array.from(message.reactions.cache.values()).filter(p => {
                // Only emoji from this server plz
                if (p instanceof GuildEmoji && p.guild.id !== message.guild.id) return false;
                return true;
            }).map(p => p.emoji.toString());

            game.context.emotelist = shuffle([ ... emoji ]);
            game.context.emotepot = emoji;

            game.channel.send({ embeds: [{
                color: "#00BB00",
                fields: [{
                    name: "Time to write those stories!",
                    value: "Players, hop into your DMs and get the create juice flowing."
                }]
            }]});
            return "story";
        },
        "story": async game => {
            const title = game.context.round === 0 ? "Start a story." : game.context.round === game.context.rounds - 1 ? "End the following story." : "Continue the following story.";
            
            const messages: Promise<Message>[] = [];
            for (let i = 0; i < game.players.length; i++) {
                const story = (i + game.context.round) % game.players.length;
                let sofar = "*Type your sentence below.*";

                if (game.context.emotepot.length) {
                    sofar += "\n*Make it related to the following Emoji:* ";
                    if (!game.context.emotelist.length) {
                        game.context.emotelist = shuffle([... game.context.emotepot]);
                    }
                    const e = game.context.emotelist.pop();
                    game.context.storymotes[story][game.context.round] = e;
                    sofar += e;
                }

                if (game.context.round > 0) sofar = game.context.stories[story][game.context.round - 1] + "\n\n" + sofar;
                if (game.context.round > 1) sofar = "...\n" + sofar;

                messages.push(game.players[i].send({ embeds: [{
                    color: "#00BB00",
                    fields: [{
                        name: title,
                        value: sofar
                    }]
                }]}));
            }

            await Promise.all(messages);

            // Write sentences
            return await new Promise<SRStates>(resolve => {
                for (let i = 0; i < game.players.length; i++) {
                    const player = game.players[i];
                    const story = (i + game.context.round) % game.players.length;

                    game.onMessageCallback(player.dmChannel, player, async m => {
                        // Set message
                        game.context.stories[story][game.context.round] = m.content;

                        // Check if everyone is done
                        let done = true;
                        for (let i = 0; i < game.players.length; i++) {
                            if (!game.context.stories[i][game.context.round].length) done = false;
                        }

                        await m.reply({ embeds: [{
                            color: "#00BB00",
                            description: "**Sentence set!**"
                        }]});

                        if (!done) return;

                        // End game
                        if (game.context.round === game.context.rounds - 1) {
                            resolve("display");
                            return;
                        }

                        game.context.round += 1;
                        resolve("story");
                    });
                }
            });
        },
        "display": async game => {
            let ended = false;

            const control = new MessageController(game, p => {
                if (game.context.currentStory < 0) {
                    return {
                        embeds: [{
                            color: "#00BB00",
                            description: "**All stories have been written!**"
                        }],
                        components: !p ? undefined : [[{
                            type: "BUTTON",
                            style: "SUCCESS",
                            label: "Continue",
                            customId: "continue",
                            disabled: ended
                        }]]
                    }
                } else {
                    // Get current player
                    let player = game.context.currentStory - game.context.currentSentence;
                    while (player < 0) player += game.players.length;

                    // Send to all
                    return {
                        embeds: [{
                            color: "#00BB00",
                            fields: [{
                                name: "Story #" + (game.context.currentStory + 1),
                                value: game.context.portion
                            }]
                        }],
                        components: !p ? undefined : [[{
                            type: "BUTTON",
                            style: "SUCCESS",
                            label: "Continue",
                            customId: "continue",
                            disabled: ended || p.id !== game.players[player].id
                        }]]
                    }
                }
            });

            await control.sendAll();

            await new Promise<void>(resolve => {
                for (const player of game.players) {
                    game.onButtonCallback(control.playerMessages[player.id], "continue", async i => {
                        game.resetControls();
                        await onButton(i, control, game, () => ended = true, () => ended = false);
                        resolve();
                    });
                }
            });
        }
    }

}

async function onButton(i: ButtonInteraction, control: MessageController, game: GameInstance<SRContext, SRStates>, ended: () => void, started: () => void) {
    // Advance story
    let send = false;

    if (game.context.currentStory < 0 || game.context.currentSentence + 1 >= game.context.rounds) {
        ended();
        if (game.context.currentStory < 0) control.updateAll(i);
        else control.update(i);

        if (game.context.currentStory + 1 >= game.players.length) {
            new MessageController(game, () => { return { embeds: [{
                color: "#00BB00",
                description: "**The End.**",
            }]}}).sendAll();
            return;
        }

        game.context.currentStory += 1;
        game.context.currentSentence = 0;
        send = true;
        started();
    } else {
        game.context.currentSentence += 1;
    }

    // Set displayed portion
    game.context.portion = "";
    for (let i = 0; i <= game.context.currentSentence; i++) {
        let player = game.context.currentStory - i;
        while (player < 0) player += game.players.length;

        if (game.context.emotepot.length) {
            game.context.portion += game.context.storymotes[game.context.currentStory][i] + " "; 
        }

        game.context.portion += "<@" + game.players[player].id + ">: " + game.context.stories[game.context.currentStory][i] + "\n";
    }
    if (game.context.currentSentence < game.context.rounds - 1) game.context.portion += "...";

    // Update
    game.buttons = {};

    if (send) {
        await control.sendAll();
    } else {
        await control.updateAll(i);
    }

    // Let only speaker continue
    let player = game.context.currentStory - game.context.currentSentence;
    while (player < 0) player += game.players.length;

    const interaction = await game.onButton(control.playerMessages[game.players[player].id], "continue");
    onButton(interaction, control, game, ended, started);
}
