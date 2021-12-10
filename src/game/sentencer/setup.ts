import { CommandInteraction, MessageOptions, Snowflake } from "discord.js";
import { GameInstance, MessageController, shuffle } from "../game";
import { Sentencer, SRContext, SRStates } from "./sentencer";

export async function setup(game: GameInstance<SRContext, SRStates>, i: CommandInteraction): Promise<SRStates | void> {

    let started = false;

    const setup = new MessageController(game, () => {

        const message: MessageOptions = {
            embeds: [
                {
                    color: "#00BB00",
                    title: Sentencer.name,
                    fields: [
                        {
                            name: "Players",
                            value: game.players.map(p => "<@" + p.id + ">").join("\n") || "*None*"
                        }
                    ]
                }
            ],
            components: [
                [
                    {
                        type: "BUTTON",
                        disabled: true,
                        style: "PRIMARY",
                        label: "Rules",
                        customId: "rules"
                    },
                    {
                        type: "BUTTON",
                        style: game.context.emotes ? "SUCCESS" : "SECONDARY",
                        label: "Emojis",
                        customId: "emotes",
                        disabled: started
                    },
                ],
                [
                    {
                        type: "BUTTON",
                        disabled: true,
                        style: "PRIMARY",
                        label: "Rounds",
                        customId: "rounds"
                    },
                    {
                        type: "BUTTON",
                        style: "PRIMARY",
                        label: "◀️",
                        customId: "decrounds",
                        disabled: started || game.context.rounds <= 2
                    },
                    {
                        type: "BUTTON",
                        style: "SECONDARY",
                        label: game.context.rounds.toString(),
                        customId: "setrounds",
                        disabled: started
                    },
                    {
                        type: "BUTTON",
                        style: "PRIMARY",
                        label: "▶️",
                        customId: "incrounds",
                        disabled: started
                    }
                ],
                [
                    {
                        type: "BUTTON",
                        style: "SUCCESS",
                        label: "Join",
                        customId: "join",
                        disabled: started
                    },
                    {
                        type: "BUTTON",
                        style: "DANGER",
                        label: "Leave",
                        customId: "leave",
                        disabled: started
                    },
                    {
                        type: "BUTTON",
                        style: "PRIMARY",
                        label: "Start",
                        customId: "start",
                        disabled: started || game.players.length < 2
                    }
                ]
            ]
        }

        return message;
    });

    const message = await setup.reply(i);

    game.onButtonCallback(message, "join", async i => {
        if (game.players.indexOf(i.user) >= 0) {
            i.reply({ content: "You've already joined!", ephemeral: true });
            return;
        }

        game.players.push(i.user);
        setup.update(i);
    });

    game.onButtonCallback(message, "leave", async i => {
        if (game.players.indexOf(i.user) === -1) {
            i.reply({ content: "You haven't even joined!", ephemeral: true });
            return;
        }

        game.players.splice(game.players.indexOf(i.user), 1);
        setup.update(i);
    });

    game.onButtonCallback(message, "emotes", async i => {
        game.context.emotes = !game.context.emotes;
        setup.update(i);
    });

    game.onButtonCallback(message, "decrounds", async i => {
        game.context.rounds -= 1;
        setup.update(i);
    });

    game.onButtonCallback(message, "incrounds", async i => {
        game.context.rounds += 1;
        setup.update(i);
    });

    game.onButtonCallback(message, "setrounds", async i => {
        i.reply({ ephemeral: true, content: "Type a number below to set the amount of rounds." });

        const m = await game.onMessage(game.channel, i.user);
        const number = parseInt(m.content);

        if (!number || number < 2) return;
        if (m.deletable) m.delete();

        game.context.rounds = number;
        setup.edit(null);
    });

    const interaction = await game.onButton(message, "start");

    started = true;
    setup.update(interaction);

    shuffle(game.players);

    for (const _p of game.players) {
        game.context.stories.push(Array(game.context.rounds).fill(""));
        game.context.storymotes.push(Array(game.context.rounds).fill(""));
    }

    if (game.context.emotes) {
        return "emotes";
    } else {
        game.channel.send({ embeds: [{
            color: "#00BB00",
            fields: [{
                name: "Time to write those stories!",
                value: "Players, hop into your DMs and get the create juice flowing."
            }]
        }]});
        return "story";
    }
}
