import { ButtonInteraction, CommandInteraction, MessageActionRow, MessageButton, MessageOptions } from "discord.js";
import { GameInstance, MessageController, shuffle } from "../game";
import { boards, drawPlayers, packs, SecretHitler, SHContext, SHStates } from "./secrethitler";

export async function setup(game: GameInstance<SHContext, SHStates>, i: CommandInteraction): Promise<SHStates | void> {

    let packPicked = 0;
    let started = false;

    const setup = new MessageController(game, () => {

        const message: MessageOptions = {
            embeds: [
                {
                    color: SecretHitler.color,
                    title: SecretHitler.name,
                    fields: [
                        {
                            name: "Players",
                            value: drawPlayers(game.context.players, game.context.president) || "*None*"
                        }
                    ]
                }
            ],
            components: [
                new MessageActionRow().addComponents(
                    new MessageButton()
                        .setCustomId("pack")
                        .setLabel("Pack")
                        .setStyle("PRIMARY")
                        .setDisabled(true),
                    ...packs.map((p, i) => (new MessageButton()
                        .setCustomId("pick" + i)
                        .setLabel(p.name)
                        .setStyle(packPicked === i ? "SUCCESS" : "SECONDARY")
                        .setDisabled(started)
                    ))
                ),
                new MessageActionRow().addComponents(
                    new MessageButton()
                        .setCustomId("add")
                        .setLabel("Add Bot")
                        .setStyle("SECONDARY")
                        .setDisabled(started || game.context.players.length >= 10),
                    new MessageButton()
                        .setCustomId("remove")
                        .setLabel("Remove Bot")
                        .setStyle("SECONDARY")
                        .setDisabled(started || !game.context.players.find(p => p.bot))
                ),
                new MessageActionRow().addComponents(
                    new MessageButton()
                        .setCustomId("join")
                        .setLabel("Join")
                        .setStyle("SUCCESS")
                        .setDisabled(started || game.context.players.length >= 10),
                    new MessageButton()
                        .setCustomId("leave")
                        .setLabel("Leave")
                        .setStyle("DANGER")
                        .setDisabled(started),
                    new MessageButton()
                        .setCustomId("start")
                        .setLabel("Start")
                        .setStyle("PRIMARY")
                        .setDisabled(started || game.context.players.length < 5 || game.context.players.length > 10)
                )
            ]
        }

        return message;
    });

    const message = await setup.reply(i);

    for (let p = 0; p < packs.length; p++) {
        game.onButtonCallback(message, "pick" + p, async i => {
            packPicked = p;
            setup.update(i);
        })
    }

    game.onButtonCallback(message, "add", async i => {
        game.context.players.push({
            bot: true,
            investigated: false,
            id: null,
            fascist: null,
            hitler: null,
            role: null,
            dead: false,
            vote: true, // Yes men!
        });

        setup.update(i);
    });

    game.onButtonCallback(message, "remove", async i => {
        const index = game.context.players.findIndex(p => p.bot);
        if (index >= 0) game.context.players.splice(index, 1);
        setup.update(i);
    });

    game.onButtonCallback(message, "join", async i => {
        if (game.players.indexOf(i.user) >= 0) {
            i.reply({ content: "You've already joined!", ephemeral: true });
            return;
        }

        game.players.push(i.user);
        game.context.players.push({
            bot: false,
            investigated: false,
            id: i.user.id,
            fascist: null,
            hitler: null,
            role: null,
            dead: false,
            vote: null
        });

        setup.update(i);
    });

    game.onButtonCallback(message, "leave", async i => {
        if (game.players.indexOf(i.user) === -1) {
            i.reply({ content: "You haven't even joined!", ephemeral: true });
            return;
        }

        game.players.splice(game.players.indexOf(i.user), 1);
        game.context.players.splice(game.context.players.findIndex(p => p.id === i.user.id), 1);
        setup.update(i);
    });

    // Await for start with the right conditions
    let interaction: ButtonInteraction;
    while (true) {
        interaction = await game.onButton(message, "start");
        if (game.context.players.length >= 5 && game.context.players.length <= 10) break;
    }

    // Set pack
    game.context.pack = packs[packPicked];

    // Set number of fascists
    let fascists = 0;
    if (game.context.players.length >= 7) fascists += 1;
    if (game.context.players.length >= 9) fascists += 1;

    // Set board
    game.context.board.fascistBoard = boards[0];
    if (game.context.players.length >= 7) game.context.board.fascistBoard = boards[1];
    if (game.context.players.length >= 9) game.context.board.fascistBoard = boards[2];

    // Set roles
    const toChoose = shuffle(game.context.players.map((_p, i) => i));

    const hitler = toChoose.pop();
    game.context.players[hitler].fascist = true;
    game.context.players[hitler].hitler = true;
    game.context.players[hitler].role = game.context.pack.hitler;

    const vice = toChoose.pop();
    game.context.players[vice].fascist = true;
    game.context.players[vice].hitler = false;
    game.context.players[vice].role = game.context.pack.vice;

    const fascist = shuffle([...game.context.pack.fascist]);
    for (let i = 0; i < fascists; i++) {
        const f = toChoose.pop();
        game.context.players[f].fascist = true;
        game.context.players[f].hitler = false;
        game.context.players[f].role = fascist.pop();
    }

    const liberal = shuffle([...game.context.pack.liberal]);
    for (const i of toChoose) {
        game.context.players[i].fascist = false;
        game.context.players[i].hitler = false;
        game.context.players[i].role = liberal.pop();
    }

    // START!
    started = true;
    setup.update(interaction);

    return "roles";
}
