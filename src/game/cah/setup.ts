import { ButtonInteraction, CommandInteraction, MessageButton, MessageOptions, Snowflake } from "discord.js";
import { GameInstance, MessageController, shuffle } from "../game";
import { CAH, CAHContext, CAHStates, getPlayerList, packs, randoId } from "./cah";

export async function setup(game: GameInstance<CAHContext, CAHStates>, i: CommandInteraction): Promise<CAHStates | void> {

    const packsPicked = packs.map((_p, i) => i === 0);
    let started = false;

    const setup = new MessageController(game, () => {

        const message: MessageOptions = {
            embeds: [
                {
                    color: "#000000",
                    title: CAH.name,
                    fields: [
                        {
                            name: "Players",
                            value: getPlayerList(game.players, game.context.rando)
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
                        label: "Packs",
                        customId: "packs"
                    },
                    ...packs.map((p, i) => {
                        return {
                                type: "BUTTON",
                                style: packsPicked[i] ? "SUCCESS" : "SECONDARY",
                                label: p.name,
                                customId: "pick" + i,
                                disabled: started || p.cards == null
                        } as MessageButton
                    }),
                ],
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
                        style: game.context.rando ? "SUCCESS" : "SECONDARY",
                        label: "Rando Cardrissian",
                        customId: "rando",
                        disabled: started
                    },
                    {
                        type: "BUTTON",
                        style: game.context.versus ? "SUCCESS" : "SECONDARY",
                        label: "1v1 Mode",
                        customId: "1v1",
                        disabled: started
                    },
                    {
                        type: "BUTTON",
                        style: game.context.quiplash ? "SUCCESS" : "SECONDARY",
                        label: "Quiplash Mode",
                        customId: "quiplash",
                        disabled: started
                    }
                ],
                [
                    {
                        type: "BUTTON",
                        disabled: true,
                        style: "PRIMARY",
                        label: game.context.versus ? "Rounds" : "Points",
                        customId: "points"
                    },
                    {
                        type: "BUTTON",
                        style: "PRIMARY",
                        label: "◀️",
                        customId: "decpoints",
                        disabled: started || (!game.context.versus && game.context.maxPoints <= 1) || (game.context.versus && game.context.rounds <= 1)
                    },
                    {
                        type: "BUTTON",
                        style: "SECONDARY",
                        label: game.context.versus ? game.context.rounds.toString() : game.context.maxPoints.toString(),
                        customId: "setpoints",
                        disabled: started
                    },
                    {
                        type: "BUTTON",
                        style: "PRIMARY",
                        label: "▶️",
                        customId: "incpoints",
                        disabled: started
                    }
                ],
                [
                    {
                        type: "BUTTON",
                        disabled: true,
                        style: "PRIMARY",
                        label: "Cards",
                        customId: "cards"
                    },
                    {
                        type: "BUTTON",
                        style: "PRIMARY",
                        label: "◀️",
                        customId: "deccards",
                        disabled: started || game.context.handCards <= 1
                    },
                    {
                        type: "BUTTON",
                        style: "SECONDARY",
                        label: game.context.handCards.toString(),
                        customId: "setcards",
                        disabled: started
                    },
                    {
                        type: "BUTTON",
                        style: "PRIMARY",
                        label: "▶️",
                        customId: "inccards",
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
                        disabled: started || (game.players.length < 3 && !game.context.rando && game.context.versus) || (game.players.length < 2)
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
        game.context.players[i.user.id] = {
            hand: [],
            playing: [],
            points: 0
        }
        setup.update(i);
    });

    game.onButtonCallback(message, "leave", async i => {
        if (game.players.indexOf(i.user) === -1) {
            i.reply({ content: "You haven't even joined!", ephemeral: true });
            return;
        }

        game.players.splice(game.players.indexOf(i.user), 1);
        delete game.context.players[i.user.id];
        setup.update(i);
    });

    for (let p = 0; p < packs.length; p++) {
        game.onButtonCallback(message, "pick" + p, async i => {
            packsPicked[p] = !packsPicked[p];
            setup.update(i);
        });
    }

    game.onButtonCallback(message, "rando", async i => {
        game.context.rando = !game.context.rando;
        if (game.context.rando) {
            game.context.players[randoId] = {
                hand: [],
                playing: [],
                points: 0
            }
        } else {
            delete game.context.players[randoId];
        }
        setup.update(i);
    });

    game.onButtonCallback(message, "1v1", async i => {
        game.context.versus = !game.context.versus;
        setup.update(i);
    });

    game.onButtonCallback(message, "quiplash", async i => {
        game.context.quiplash = !game.context.quiplash;
        setup.update(i);
    });

    game.onButtonCallback(message, "decpoints", async i => {
        if (game.context.versus) game.context.rounds -= 1;
        else game.context.maxPoints -= 1;
        setup.update(i);
    });

    game.onButtonCallback(message, "incpoints", async i => {
        if (game.context.versus) game.context.rounds += 1;
        else game.context.maxPoints += 1;
        setup.update(i);
    });

    game.onButtonCallback(message, "deccards", async i => {
        game.context.handCards -= 1;
        setup.update(i);
    });

    game.onButtonCallback(message, "inccards", async i => {
        game.context.handCards += 1;
        setup.update(i);
    });

    game.onButtonCallback(message, "setpoints", async i => {
        i.reply({ ephemeral: true, content: game.context.versus ? "Type a number below to set the amount of rounds" : "Type a number below to set the points to win." });

        const m = await game.onMessage(game.channel, i.user);
        const number = parseInt(m.content);

        if (!number || number <= 0) return;
        if (m.deletable) m.delete();

        game.context.maxPoints = number;
        setup.edit(null);
    });

    game.onButtonCallback(message, "setcards", async i => {
        i.reply({ ephemeral: true, content: "Type a number below to set the cards in each player's hand." });

        const m = await game.onMessage(game.channel, i.user);
        const number = parseInt(m.content);

        if (!number || number <= 0) return;
        if (m.deletable) m.delete();

        game.context.rounds = number;
        setup.edit(null);
    });

    let interaction: ButtonInteraction;
    while (true) {
        interaction = await game.onButton(message, "start");

        game.context.whiteDeck = [];
        game.context.blackDeck = [];

        for (let i = 0; i < packs.length; i++) {
            if (packsPicked[i]) {
                for (const card of packs[i].cards.white) game.context.whiteDeck.push(card);
                for (const card of packs[i].cards.black) game.context.blackDeck.push(card);
            }
        }

        if (game.context.blackDeck.length === 0) {
            interaction.reply({ ephemeral: true, content: "There are no black cards in the selected packs." });
            continue;
        }

        if (game.context.whiteDeck.length < game.players.length * game.context.handCards + (game.context.rando ? 1 : 0)) {
            interaction.reply({ ephemeral: true, content: "There aren't enough white cards in the selected packs to give everyone a full hand." });
            continue;
        }

        break;
    }

    if (game.context.versus) {
        game.context.maxPoints = 0;
    }

    shuffle(game.context.whiteDeck);
    shuffle(game.context.blackDeck);

    started = true;
    setup.update(interaction);

    return "play";
}
