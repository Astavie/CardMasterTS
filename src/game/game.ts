import { ButtonInteraction, ColorResolvable, BaseCommandInteraction, Message, SelectMenuInteraction, User, MessageActionRowComponentOptions, TextBasedChannel, ThreadChannel, Interaction } from "discord.js";
import { MessageController } from "../util/message";
import { CAH } from "./cah/cah";

// Games
export const gameInstances: GameInstance[] = [];
export const games: {[key: string]: Game} = {};

function addGame(game: Game): void {
    games[game.name] = game;
}

addGame(CAH);

// Classes
export type Game = {
    name: string,
    color: ColorResolvable,
    playedInDms: boolean,
    play: (game: GameInstance, i: BaseCommandInteraction) => Promise<void>
}

export class GameInstance {

    buttons: { [key:string]: { [key:string]: (i: ButtonInteraction) => void }} = {};
    select: { [key:string]: { [key:string]: (i: SelectMenuInteraction) => void }} = {};
    // message: { [key:string]: { [key:string]: (m: Message) => void }} = {};

    players: User[] = [];
    lobby: TextBasedChannel | undefined;
    setupMessage: MessageController | undefined;

    join?: (i: ButtonInteraction, player: User) => void;
    leave?: (i: ButtonInteraction, player: User, index: number) => void;
    maxPlayers: () => number = () => Number.MAX_SAFE_INTEGER + 1;
    minPlayers: () => number = () => 0;

    game: Game;

    constructor(game: Game) {
        this.game = game;
    }

    play(i: BaseCommandInteraction) {
        this.game.play(this, i).then(() => this.kill());
    }

    kill() {
        this.setupMessage?.endAll();

        // archive created thread
        if (this.lobby && this.lobby.isThread() && this.lobby.ownerId === process.env.CLIENT_ID) {
            this.lobby.setArchived(true, "Game ended.");
        }
    }

    onButton(message: Message, button: string, callback: (i: ButtonInteraction) => any | undefined) {
        this.buttons[message.id] = this.buttons[message.id] ?? {};
        this.buttons[message.id][button] = callback;
    }

    resolveButton(inter: ButtonInteraction) {
        this.buttons[inter.message.id]?.[inter.customId]?.(inter);
    }

    onSelect(message: Message, button: string, callback: (i: SelectMenuInteraction) => any | undefined) {
        this.select[message.id] = this.select[message.id] ?? {};
        this.select[message.id][button] = callback;
    }

    resolveSelect(inter: SelectMenuInteraction) {
        this.select[inter.message.id]?.[inter.customId]?.(inter);
    }

    // onMessage(channel: Channel, user: User, callback: (i: Message) => any | undefined) {
    //     this.message[channel.id] = this.message[channel.id] ?? {};
    //     this.message[channel.id][user.id] = callback;
    // }

    // resolveMessage(inter: Message) {
    //     this.message[inter.channel.id]?.[inter.author.id]?.(inter);
    // }

    resetControls() {
        this.buttons = {};
        this.select = {};
        // this.message = {};
    }

    async startLobby(msg: Message): Promise<ThreadChannel> {
        const thread = msg.channel.isThread() ? msg.channel : await msg.startThread({ name: CAH.name, autoArchiveDuration: 60 });
        this.lobby = thread;
        return thread;
    }

    // easy to use messages

    sendPrivate(msg: MessageController): Promise<Message[]> {
        const promises: Promise<Message>[] = [];

        for (const player of this.players) promises.push(player.createDM().then(dm => msg.send(dm)));

        return Promise.all(promises);
    }

    sendPublic(msg: MessageController): Promise<Message[]> {
        const promises: Promise<Message>[] = [];

        if (this.lobby) promises.push(msg.send(this.lobby));

        return Promise.all(promises);
    }

    sendAll(msg: MessageController): Promise<Message[][]> {
        return Promise.all([
            this.sendPrivate(msg),
            this.sendPublic(msg)
        ]);
    }

    addFlagsInput(msg: MessageController, label: string, flags: string[], values: boolean[], onChange?: (index: number, value: boolean) => any) {
        // Add buttons
        const old = msg.message;
        msg.message = (channel, prev) => {
            const m = old(channel, prev);

            const components: MessageActionRowComponentOptions[] = [{
                type: "BUTTON",
                customId: `_${label}`,
                label: label,
                style: "PRIMARY",
                disabled: true
            }];

            flags.forEach((flag, i) => components.push({
                type: "BUTTON",
                customId: `_${label}_${i}`,
                label: flag,
                style: values[i] ? "SUCCESS" : "SECONDARY"
            }));

            m.components ??= [];
            m.components.push({
                type: "ACTION_ROW",
                components: components
            });
            return m;
        };

        // Add button logic
        msg.consumers.push(m => {
            flags.forEach((_, index) => {
                this.onButton(m, `_${label}_${index}`, i => {
                    values[index] = !values[index];
                    onChange?.(index, values[index]);
                    msg.updateAll(i);
                });
            });
        });
    }

    addNumberInput(msg: MessageController, label: string, min: number, def: number, max: number, onChange?: (value: number) => any) {
        let value = def;

        // Add buttons
        const old = msg.message;
        msg.message = (channel, prev) => {
            const m = old(channel, prev);

            m.components ??= [];
            m.components.push({
                type: "ACTION_ROW",
                components: [{
                    type: "BUTTON",
                    customId: `_${label}`,
                    label: label,
                    style: "PRIMARY",
                    disabled: true
                },{
                    type: "BUTTON",
                    style: "PRIMARY",
                    label: "◀",
                    customId: `_${label}_dec`,
                    disabled: value <= min
                },{
                    type: "BUTTON",
                    style: "SECONDARY",
                    label: value.toString(),
                    customId: `_${label}_def`
                },{
                    type: "BUTTON",
                    style: "PRIMARY",
                    label: "▶",
                    customId: `_${label}_inc`,
                    disabled: value >= max
                }]
            });
            return m;
        };

        // Add button logic
        msg.consumers.push(m => {
            this.onButton(m, `_${label}_def`, i => {
                value = def;
                onChange?.(value);
                msg.updateAll(i);
            });
            this.onButton(m, `_${label}_dec`, i => {
                if (value > min) value -= 1;
                onChange?.(value);
                msg.updateAll(i);
            });
            this.onButton(m, `_${label}_inc`, i => {
                if (value < max) value += 1;
                onChange?.(value);
                msg.updateAll(i);
            });
        });
    }
    
    addSetupLogic() {
        if (!this.setupMessage) return;

        for (const m of this.setupMessage.messages) {
            if (this.leave) this.addLeaveLogic(m);
            if (this.join) this.addJoinLogic(m);
        };
    }

    addJoinLogic(m: Message) {
        this.onButton(m, "_join", i => {
            const max = this.maxPlayers();

            if (this.players.indexOf(i.user) >= 0) {
                i.reply({ content: "You've already joined!", ephemeral: true });
                return;
            }
            if (this.players.length >= max) {
                i.reply({ content: "Game is already full!", ephemeral: true });
                return;
            }
    
            this.players.push(i.user);
            this.join?.(i, i.user);
        });
    }

    addLeaveLogic(m: Message) {
        this.onButton(m, "_leave", i => {
            const index = this.players.indexOf(i.user);
            if (index === -1) {
                i.reply({ content: "You haven't even joined!", ephemeral: true });
                return;
            }
    
            this.players.splice(index, 1);
            this.leave?.(i, i.user, index);
        });
    }

    addLeaveButton(msg: MessageController) {
        // Add button
        const old = msg.message;
        msg.message = (channel, prev) => {
            const m = old(channel, prev);
            if (channel.type !== "DM") return m;

            m.components ??= [];
            m.components.push({
                type: "ACTION_ROW",
                components: [{
                    type: "BUTTON",
                    customId: "_leave",
                    label: "Leave",
                    style: "DANGER"
                }]
            });
            return m;
        };
        
        // Add button logic
        msg.consumers.push(m => {
            if (m.channel.type !== "DM") return;
            this.addLeaveLogic(m);
        });
    }
    
    setSetupMessage(msg: MessageController, start: (i: ButtonInteraction, m : Message) => void) {
        this.setupMessage = msg;

        // Add buttons
        const old = msg.message;
        msg.message = (channel, prev) => {
            const m = old(channel, prev);

            const min = this.minPlayers();
            const max = this.maxPlayers();

            const components: MessageActionRowComponentOptions[] = [{
                type: "BUTTON",
                customId: "_join",
                label: "Join",
                style: "SUCCESS"
            },{
                type: "BUTTON",
                customId: "_leave",
                label: "Leave",
                style: "DANGER"
            },{
                type: "BUTTON",
                customId: "_start",
                label: "Start",
                style: "PRIMARY",
                disabled: this.players.length < min || this.players.length > max
            }];

            m.components ??= [];
            m.components.push({
                type: "ACTION_ROW",
                components: components
            });
            return m;
        };

        // Add button logic
        msg.consumers.push(m => {
            this.addLeaveLogic(m);
            this.addJoinLogic(m);

            this.onButton(m, "_start", i => {
                const min = this.minPlayers();
                const max = this.maxPlayers();
                
                if (this.players.length < min) {
                    i.reply({ content: "Not enough players!", ephemeral: true });
                    return;
                }
                if (this.players.length > max) {
                    i.reply({ content: "Too many players!", ephemeral: true });
                    return;
                }

                start(i, m);
            });
        });
    }

    addReadyButton(msg: MessageController, ready: User[], allowed: User[], callback: () => any, unauthorizedLobby?: string) {
        // Apply effect immediately if no players need to be ready
        if (allowed.length == 0) {
            callback();
            return;
        }

        // Add button
        const old = msg.message;
        msg.message = (channel, prev) => {
            const m = old(channel, prev);
            if (channel.type !== "DM" && !unauthorizedLobby) return m;
            if (channel.type === "DM" && !allowed.includes(channel.recipient)) return m;

            m.components ??= [];
            m.components.push({
                type: "ACTION_ROW",
                components: [{
                    type: "BUTTON",
                    customId: "_ready",
                    label: "Ready",
                    style: channel.type === "DM" && ready.indexOf(channel.recipient) >= 0 ? "SUCCESS" : "SECONDARY"
                }]
            });
            return m;
        };

        // Add button logic
        msg.consumers.push(m => {
            if (m.channel.type !== "DM" && !unauthorizedLobby) return;
            if (m.channel.type === "DM" && !allowed.includes(m.channel.recipient)) return;

            this.onButton(m, "_ready", async i => {
                if (unauthorizedLobby && !allowed.includes(i.user)) {
                    i.reply({ content: unauthorizedLobby, ephemeral: true });
                    return;
                }

                ready.push(i.user);
                const all = ready.length >= allowed.length;
                if (all) {
                    callback();
                } else {
                    msg.updateAll(i);
                }
            });
        });
    }

}

export function shuffle<T>(a: T[]): T[] {
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}
