import { Client, ColorResolvable, CommandInteraction, Message, Snowflake, TextBasedChannel, User } from "discord.js";
import { disableButtons, MessageController, MessageOptions, MessageSave } from "../util/message";
import { Serializable } from "../util/saving";
import { CAH } from "./cah/cah";
import { Game, Logic, MessageGenerator, UserInteraction } from "./logic";

// Games
export const games: GameImpl<unknown>[] = [];
export const gametypes: {[key: string]: GameType<unknown>} = {};

function addGame(game: GameType<unknown>): void {
    gametypes[game.name] = game;
}

addGame(CAH);

// Impl
export type GameType<C> = {
    name: string,
    color: ColorResolvable,
    logic: Logic<unknown, C>,
    initialContext(): C,
}

export type GameSave<C> = {
    game: string,
    players: Snowflake[],
    lobbyMessage: MessageSave,
    stateMessage: MessageSave,
    context: C,
    lobby?: Snowflake,
}

export class GameImpl<C> implements Game, Serializable<GameSave<C>> {

    players: User[] = [];
    lobby?: TextBasedChannel;

    type: GameType<C>;
    context: C;

    lobbyMessage: MessageController = new MessageController();
    stateMessage: MessageController = new MessageController();

    constructor(type: GameType<C>) {
        this.type = type;
        this.context = type.initialContext();
    }

    save(): GameSave<C> {
        return {
            game: this.type.name,
            players: this.players.map(p => p.id),
            lobbyMessage: this.lobbyMessage.save(),
            stateMessage: this.stateMessage.save(),
            context: this.context,
            lobby: this.lobby?.id,
        }
    }

    async load(client: Client, data: GameSave<C>): Promise<void> {
        this.context = data.context;

        const promises: Promise<unknown>[] = [
            this.stateMessage.load(client, data.stateMessage),
            this.lobbyMessage.load(client, data.lobbyMessage),
        ];

        this.players = Array(data.players.length);
        for (let i = 0; i < this.players.length; i++) {
            promises.push(client.users.fetch(data.players[i]).then(p => this.players[i] = p));
        }

        if (data.lobby) promises.push(
            client.channels.fetch(data.lobby).then(c => {
                if (!c?.isText()) throw new Error();
                this.lobby = c;
            })
        );

        await Promise.all(promises);
    }

    start(i: CommandInteraction) {
        games.push(this);
        this.type.logic.onEnter?.(this.context, this, () => this.end(), i);
    }

    end() {
        this.type.logic.onExit?.(this.context, this);
        games.splice(games.indexOf(this), 1);

        if (this.lobby && this.lobby.isThread() && this.lobby.ownerId === process.env.CLIENT_ID) {
            this.lobby.setArchived(true, 'Game ended.');
        }
    }

    async allowSpectators(): Promise<void> {
        const msg = Object.values(this.lobbyMessage.messages)[0].msg;
        this.lobby = msg.channel.isThread()
            ? msg.channel
            : await msg.startThread({ name: this.type.name, autoArchiveDuration: 60 });
    }

    isMyInteraction(i: UserInteraction) {
        return this.stateMessage.isMyInteraction(i) || this.lobbyMessage.isMyInteraction(i);
    }

    onInteraction(i: UserInteraction) {
        if (i.isButton() && (i.customId === '_prevpage' || i.customId === '_nextpage')) {
            this.stateMessage.flipPage(i);
        } else {
            this.type.logic.onInteraction?.(this.context, this, () => this.end(), i);
        }
    }

    async sendSpectators(message: Partial<MessageOptions>): Promise<void> {
        for (const embed of message.embeds ?? []) embed.color ??= this.type.color;
        await this.lobby?.send(message);
    }

    async sendPlayers(message: Partial<MessageOptions>): Promise<void> {
        for (const embed of message.embeds ?? []) embed.color ??= this.type.color;

        const promises: Promise<Message>[] = [];
        for (const player of this.players) {
            promises.push(
                player.createDM().then(dm => dm.send(message))
            );
        }
        await Promise.all(promises);
    }

    async sendAll(message: Partial<MessageOptions>): Promise<void> {
        await Promise.all([
            this.sendSpectators(message),
            this.sendPlayers(message)
        ]);
    }

    async send(message: (user: User | null) => Partial<MessageOptions> | null): Promise<void> {
        const promises: Promise<Message>[] = [];
        
        if (this.lobby) {
            const msg = message(null);
            if (msg) {
                for (const embed of msg.embeds ?? []) embed.color ??= this.type.color;
                promises.push(this.lobby.send(msg));
            }
        }

        for (const player of this.players) {
            const msg = message(player);
            if (msg) {
                for (const embed of msg.embeds ?? []) embed.color ??= this.type.color;
                promises.push(player.createDM().then(dm => dm.send(msg)));
            }
        }

        await Promise.all(promises);
    }

    async updateLobby(message: MessageOptions, i?: UserInteraction | CommandInteraction): Promise<void> {
        for (const embed of message.embeds) {
            embed.title ??= this.type.name;
            embed.color ??= this.type.color;
        }
        await this.lobbyMessage.send(
            i?.channel ?? Object.values(this.lobbyMessage.messages)[0].msg.channel,
            message,
            i
        );
    }

    async closeLobby(i?: UserInteraction, exceptions?: string[]): Promise<void> {
        const msg = Object.values(this.lobbyMessage.messages)[0].msg;
        const options = {
            embeds: msg.embeds,
            components: disableButtons(msg.components, exceptions),
        };
        if (i) {
            await i.update(options);
        } else {
            await msg.edit(options);
        }
    }

    async updateMessage(message: MessageOptions | MessageGenerator, i?: UserInteraction): Promise<void> {
        if (typeof message === 'function') {
            const promises: Promise<void>[] = [];

            if (this.lobby) {
                const msg = message(null);
                if (msg) {
                    for (const embed of msg.embeds) {
                        embed.title ??= this.type.name;
                        embed.color ??= this.type.color;
                    }
                    promises.push(this.stateMessage.send(
                        this.lobby,
                        msg, 
                        i?.channel === this.lobby ? i : undefined
                    ));
                }
            }

            for (const player of this.players) {
                const msg = message(player);
                if (msg) {
                    for (const embed of msg.embeds) {
                        embed.title ??= this.type.name;
                        embed.color ??= this.type.color;
                    }
                    promises.push(player.createDM().then(dm => this.stateMessage.send(
                        dm,
                        msg,
                        i?.channel === dm ? i : undefined
                    )));
                }
            }

            await Promise.all(promises);
        } else {
            for (const embed of message.embeds) {
                embed.title ??= this.type.name;
                embed.color ??= this.type.color;
            }
            await this.stateMessage.send(i!.channel!, message, i);
        }
    }

    async closeMessage(message?: MessageGenerator, i?: UserInteraction, filter: (user: User | null) => boolean = () => true): Promise<void> {
        const promises: Promise<unknown>[] = [];

        for (const obj of Object.values(this.stateMessage.messages)) {
            const channel = obj.msg.channel;
            const user = channel.type === "DM" ? channel.recipient : null;
            if (!filter(user)) continue;

            const msg = message?.(user);

            if (msg) {
                for (const embed of msg.embeds) {
                    embed.title ??= this.type.name;
                    embed.color ??= this.type.color;
                }
                const options = {
                    embeds: msg.embeds,
                    components: disableButtons(msg.components),
                    forceList: false,
                };
                promises.push(this.stateMessage.send(
                    channel,
                    options,
                    i?.channel === channel ? i : undefined,
                ));
            } else {
                const options = {
                    embeds: obj.msg.embeds,
                    components: disableButtons(obj.msg.components),
                };
                if (i?.channel === channel) {
                    promises.push(i.update(options));
                } else {
                    promises.push(obj.msg.edit(options));
                }
            }

            delete this.stateMessage.messages[channel.id];
        }

        await Promise.all(promises);
    }

}

