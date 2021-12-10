import { MessageActionRow, MessageButton, MessageOptions, User } from "discord.js";
import { GameInstance, MessageController } from "../game";
import { emoji, getName, SecretHitler, SHContext, SHStates } from "./secrethitler";

export async function roles(game: GameInstance<SHContext, SHStates>): Promise<SHStates | void> {

    const ready = new Set<User>();

    const roles = new MessageController(game, u => {
        if (u === null) {
            return {
                embeds: [
                    {
                        color: SecretHitler.color,
                        title: SecretHitler.name,
                        fields: [
                            {
                                name: `The game has started!`,
                                value: `Everyone, look at your DMs to see your role and play.`
                            }
                        ]
                    }
                ]
            }
        }

        const player = game.context.players.find(p => p.id === u.id);

        let members: string;
        if (player.fascist && (!player.hitler || game.context.players.length <= 6)) {
            members =
                getName(game.context.players.find(p => p.hitler), game.context.players) + ` is **${game.context.pack.hitler}**\n` +
                game.context.players.filter(p => p.fascist && !p.hitler).map(p => getName(p, game.context.players) + ` is ${p.role}`).join("\n")
        } else {
            members = `As you are a ${player.role}, you do not know who the other ${player.fascist ? "Fascists" : "Liberals"} are.`
        }

        const message: MessageOptions = {
            embeds: [
                {
                    color: SecretHitler.color,
                    title: SecretHitler.name,
                    fields: [
                        {
                            name: `${player.fascist ? emoji.fascistTile : emoji.liberalTile} Role`,
                            value:
                                `\` Role  \` ${player.role}\n` +
                                `\` Party \` ${player.fascist ? "Fascist" : "Liberal"}`
                        },
                        {
                            name: `${player.fascist ? emoji.fascistTile : emoji.liberalTile} Members`,
                            value: members
                        }
                    ]
                }
            ],
            components: [
                new MessageActionRow().addComponents(
                    new MessageButton()
                        .setCustomId("ready")
                        .setLabel("Ready")
                        .setStyle(ready.has(u) ? "SUCCESS" : "SECONDARY")
                        .setDisabled(ready.has(u))
                )
            ]
        }

        return message;
    });

    await roles.sendAll();

    await game.onReady(roles, ready, () => true, "ready");

    return "nominate";
}
