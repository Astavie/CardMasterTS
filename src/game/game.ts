// Imports
import { ButtonInteraction, Channel, ColorResolvable, CommandInteraction, Message, MessageComponentInteraction, MessageOptions, NewsChannel, SelectMenuInteraction, TextChannel, ThreadChannel, User } from "discord.js";
import { CAH } from "./cah/cah";
import { Sentencer } from "./sentencer/sentencer";
import { SecretHitler } from "./secrethitler/secrethitler";

// Games
export const gameInstances: GameInstance<any, any>[] = [];
export const games: {[key: string]: Game<any, any>} = {};

function addGame(game: Game<any, any>): void {
    games[game.name] = game;
}

addGame(CAH);
addGame(Sentencer);
addGame(SecretHitler);

// Classes
export type Game<T, S extends string> = {

    name: string,

    color?: ColorResolvable,

    context: () => T,
    
    onStart: (game: GameInstance<T, S>, i: CommandInteraction) => Promise<S | void>,

    states: {[key in S]: (game: GameInstance<T, S>) => Promise<S | void> },

}

export function shuffle<T>(a: T[]): T[] {
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

export type MessageGenerator = (player: User | null) => MessageOptions | null;

export class MessageController {

    game: GameInstance<any, any>;
    message: MessageGenerator;

    channelMessage: Message;
    playerMessages: {[key: string]: Message} = {};

    constructor(game: GameInstance<any, any>, message: MessageGenerator) {
        this.game = game;
        this.message = message;
    }

    async reply(i: CommandInteraction | MessageComponentInteraction) {
        if (i.channel.type === "dm") {
            this.playerMessages[i.user.id] = await i.reply({ ... this.message(i.user), fetchReply: true }) as Message;
            return this.playerMessages[i.user.id];
        }

        this.channelMessage = await i.reply({ ... this.message(null), fetchReply: true }) as Message;
        return this.channelMessage;
    }

    async send(p: User | null) {
        if (!p) {
            this.channelMessage = await this.game.channel.send(this.message(null));
            return this.channelMessage;
        }

        this.playerMessages[p.id] = await p.send(this.message(p));
        return this.playerMessages[p.id];
    }

    update(i: MessageComponentInteraction) {
        return i.update(this.message(i.channel.type === "dm" ? i.user : null));
    }

    edit(p: User | null) {
        if (!p) return this.channelMessage.edit(this.message(null));
        return this.playerMessages[p.id].edit(this.message(p));
    }

    replyAll(i: CommandInteraction | MessageComponentInteraction) {
        const promises: Promise<any>[] = [];

        for (const player of this.game.players) {
            const message = this.message(player);

            if (i.channel.type === "dm" && i.user.id === player.id) {
                promises.push(
                    i.reply({ ... message, fetchReply: true })
                    .then(m => this.playerMessages[player.id] = m as Message)
                );
            } else {
                promises.push(
                    player.send(message)
                    .then(m => this.playerMessages[player.id] = m)
                );
            }
        }

        const message = this.message(null);

        if (i.channel.type !== "dm") {
            promises.push(
                i.reply({ ... message, fetchReply: true })
                .then(m => this.channelMessage = m as Message)
            );
        } else {
            promises.push(
                this.game.channel.send(message)
                .then(m => this.channelMessage = m as Message)
            );
        }

        return Promise.all(promises);
    }

    sendAll() {
        const promises: Promise<any>[] = [];

        for (const player of this.game.players) {
            const message = this.message(player);

            promises.push(
                player.send(message)
                .then(m => this.playerMessages[player.id] = m)
            );
        }

        const message = this.message(null);

        promises.push(
            this.game.channel.send(message)
            .then(m => this.channelMessage = m as Message)
        );

        return Promise.all(promises);
    }

    sendPlayers() {
        const promises: Promise<any>[] = [];

        for (const player of this.game.players) {
            const message = this.message(player);

            promises.push(
                player.send(message)
                .then(m => this.playerMessages[player.id] = m)
            );
        }

        return Promise.all(promises);
    }

    updateAll(i: MessageComponentInteraction) {
        const promises: Promise<any>[] = [];

        for (const player of this.game.players) {
            const message = this.message(player);

            if (i.channel.type === "dm" && i.user.id === player.id) {
                promises.push(i.update(message));
            } else {
                if (this.playerMessages[player.id]) {
                    promises.push(this.playerMessages[player.id].edit(message));
                } else {
                    promises.push(
                        player.send(message)
                        .then(m => this.playerMessages[player.id] = m)
                    );
                }
            }
        }

        const message = this.message(null);

        if (i.channel.type !== "dm") {
            promises.push(i.update(message));
        } else {
            if (this.channelMessage) {
                promises.push(this.channelMessage.edit(message));
            } else {
                promises.push(
                    this.game.channel.send(message)
                    .then(m => this.channelMessage = m as Message)
                );
            }
        }

        return Promise.all(promises);
    }

    editAll() {
        const promises: Promise<any>[] = [];

        for (const player of this.game.players) {
            const message = this.message(player);

            if (this.playerMessages[player.id]) {
                promises.push(this.playerMessages[player.id].edit(message));
            } else {
                promises.push(
                    player.send(message)
                    .then(m => this.playerMessages[player.id] = m)
                );
            }
        }

        const message = this.message(null);

        if (this.channelMessage) {
            promises.push(this.channelMessage.edit(message));
        } else {
            promises.push(
                this.game.channel.send(message)
                .then(m => this.channelMessage = m as Message)
            );
        }

        return Promise.all(promises);
    }

}

export class GameInstance<T, S extends string> {

    game: Game<T, S>

    buttons: { [key:string]: { [key:string]: (i: ButtonInteraction) => void }} = {}
    select: { [key:string]: { [key:string]: (i: SelectMenuInteraction) => void }} = {}
    message: { [key:string]: { [key:string]: (m: Message) => void }} = {}
    kill: () => void = () => {}

    players: User[] = []
    channel: TextChannel | NewsChannel | ThreadChannel

    context: T

    constructor(game: Game<T, S>, channel: TextChannel | NewsChannel | ThreadChannel) {
        this.game = game;
        this.channel = channel;
        this.context = game.context();
    }

    async play(i: CommandInteraction) {
        let state = await this.game.onStart(this, i);

        while (state) {
            this.resetControls();
            state = await this.game.states[state](this);
        }

        // At the end, the game has stopped
        gameInstances.splice(gameInstances.indexOf(this), 1);
    }

    onButton(message: Message, button: string): Promise<ButtonInteraction> {
        let resolve: (i: ButtonInteraction) => void;
        const promise = new Promise<ButtonInteraction>(r => {
            resolve = r;
        });

        this.buttons[message.id] = this.buttons[message.id] ?? {};
        this.buttons[message.id][button] = resolve;

        return promise;
    }

    onButtonCallback(message: Message, button: string, callback: (i: ButtonInteraction) => void) {
        this.onButton(message, button).then(i => {
            callback(i);
            this.onButtonCallback(message, button, callback);
        });
    }

    resolveButton(inter: ButtonInteraction) {
        this.buttons[inter.message.id]?.[inter.customId]?.(inter);
    }

    onSelect(message: Message, button: string): Promise<SelectMenuInteraction> {
        let resolve: (i: SelectMenuInteraction) => void;
        const promise = new Promise<SelectMenuInteraction>(r => {
            resolve = r;
        });

        this.select[message.id] = this.select[message.id] ?? {};
        this.select[message.id][button] = resolve;

        return promise;
    }

    onSelectCallback(message: Message, button: string, callback: (i: SelectMenuInteraction) => void) {
        this.onSelect(message, button).then(i => {
            callback(i);
            this.onSelectCallback(message, button, callback);
        });
    }

    resolveSelect(inter: SelectMenuInteraction) {
        this.select[inter.message.id]?.[inter.customId]?.(inter);
    }

    onMessage(channel: Channel, user: User): Promise<Message> {
        let resolve: (m: Message) => void;
        const promise = new Promise<Message>(r => {
            resolve = r;
        });

        this.message[channel.id] = this.message[channel.id] ?? {};
        this.message[channel.id][user.id] = resolve;

        return promise;
    }

    onMessageCallback(channel: Channel, user: User, callback: (i: Message) => void) {
        this.onMessage(channel, user).then(m => {
            callback(m);
            this.onMessageCallback(channel, user, callback);
        });
    }

    onReady(message: MessageController, ready: Set<User>, filter: (user: User) => boolean | null, button: string) {
        return new Promise<void>(resolve => {
            // Apply effect when last player clicks on ready
            let count = 0;
            for (const player of this.players) {
                if (player.id in message.playerMessages && filter(player)) {
                    // Count number of players to wait on
                    count += 1;

                    // Ready button logic
                    this.onButton(message.playerMessages[player.id], button).then(async i => {
                        ready.add(player);
                        const all = ready.size >= count;
                        await message.update(i);
                        if (all) {
                            resolve();
                        }
                    });
                }
            }

            // Apply effect immediately if no players need to be ready
            if (count == 0) {
                resolve();
            }
        });
    }

    resolveMessage(inter: Message) {
        this.message[inter.channel.id]?.[inter.author.id]?.(inter);
    }

    onKill(): Promise<void> {
        let resolve: () => void;
        const promise = new Promise<void>(r => {
            resolve = r;
        });

        this.kill = resolve;

        return promise;
    }

    resolveKill() {
        this.kill();
    }

    resetControls() {
        // Reset controls
        this.buttons = {};
        this.select = {};
        this.message = {};
        this.kill = () => {};
    }

}
