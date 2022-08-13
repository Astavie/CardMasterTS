import { ButtonInteraction, ColorResolvable, BaseCommandInteraction, Message, SelectMenuInteraction, User, MessageActionRowComponentOptions, TextBasedChannel, ThreadChannel, Snowflake, ModalSubmitInteraction, MessageActionRowComponentResolvable, MessageComponentInteraction } from "discord.js";
import { MessageController, MessageGenerator } from "../util/message";
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

    buttons: { [key:string]: (i: ButtonInteraction) => void } = {};
    select:  { [key:string]: (i: SelectMenuInteraction) => void } = {};
    modals:  { [key:string]: (i: ModalSubmitInteraction) => void } = {};

    players: User[] = [];
    lobby: TextBasedChannel | undefined;
    setupMessage: MessageController | undefined;
    activeMessage: MessageController | undefined;

    join?: (i: ButtonInteraction, player: User) => void;
    leave?: (i: ButtonInteraction, player: User, index: number) => void;
    maxPlayers: () => number = () => Number.MAX_SAFE_INTEGER;
    minPlayers: () => number = () => 0;

    game: Game;

    constructor(game: Game) {
        this.game = game;
    }

    play(i: BaseCommandInteraction) {
        this.resetControls();
        gameInstances.push(this);
        this.game.play(this, i).then(() => this.kill());
    }

    kill() {
        this.activeMessage?.endAll();
        this.setupMessage?.endAll();
        gameInstances.splice(gameInstances.indexOf(this), 1);

        // archive created thread
        if (this.lobby && this.lobby.isThread() && this.lobby.ownerId === process.env.CLIENT_ID) {
            this.lobby.setArchived(true, "Game ended.");
        }
    }

    isMyInteraction(i: MessageComponentInteraction | ModalSubmitInteraction) {
        return (this.activeMessage ? this.activeMessage.isMyInteraction(i) : false) ||
               (this.setupMessage  ? this.setupMessage .isMyInteraction(i) : false);
    }

    onButton(button: string, callback: (i: ButtonInteraction) => any | undefined) {
        this.buttons[button] = callback;
    }

    resolveButton(inter: ButtonInteraction) {
        this.buttons[inter.customId]?.(inter);
    }

    onModal(modal: string, callback: (i: ModalSubmitInteraction) => any | undefined) {
        this.modals[modal] = callback;
    }

    resolveModal(inter: ModalSubmitInteraction) {
        this.modals[inter.customId]?.(inter);
    }

    onSelect(button: string, callback: (i: SelectMenuInteraction) => any | undefined) {
        this.select[button] = callback;
    }

    resolveSelect(inter: SelectMenuInteraction) {
        this.select[inter.customId]?.(inter);
    }

    resetControls() {
        this.buttons = {};
        this.select = {};
        this.modals = {};

        // Page flip buttons
        this.buttons["_prevpage"] = i => {
            const p = this.activeMessage?.pages[i.channel!.id];
            if (p) {
                let page = p.page - 1;
                if (page < 0) page = 0;
                p.page = page;
                i.update(p.pages[page]);
            }
        };
        this.buttons["_nextpage"] = i => {
            const p = this.activeMessage?.pages[i.channel!.id];
            if (p) {
                let page = p.page + 1;
                if (page >= p.pages.length) page = p.pages.length - 1;
                p.page = page;
                i.update(p.pages[page]);
            }
        };
    }

    async startLobby(msg: Message): Promise<ThreadChannel> {
        this.lobby = msg.channel.isThread() ? msg.channel : await msg.startThread({ name: CAH.name, autoArchiveDuration: 60 });
        return this.lobby;
    }

    // easy to use messages

    createMessage(message: MessageGenerator = (() => ({})), forceList: boolean = false) {
        this.activeMessage = new MessageController(message, forceList);
        return this.activeMessage;
    }

    sendPrivate(message?: MessageGenerator): Promise<Message[]> {
        let send: (c: TextBasedChannel) => Promise<Message>;
        if (message) {
            send = c => c.send(message(c));
        } else {
            const msg = this.activeMessage;
            if (!msg) throw new Error("Message undefined");
            send = c => msg.send(c);
        }

        const promises: Promise<Message>[] = [];

        for (const player of this.players) promises.push(player.createDM().then(dm => send(dm)));

        return Promise.all(promises);
    }

    sendPublic(message?: MessageGenerator): Promise<Message | undefined> {
        if (!this.lobby) return Promise.resolve(undefined);
        if (message) {
            return this.lobby.send(message(this.lobby));
        } else {
            if (!this.activeMessage) throw new Error("Message undefined");
            return this.activeMessage.send(this.lobby);
        }
    }

    sendAll(message?: MessageGenerator): Promise<[Message[], Message | undefined]> {
        return Promise.all([
            this.sendPrivate(message),
            this.sendPublic(message)
        ]);
    }

    // easy to use inputs

    addFlagsInput(label: string, flags: string[], values: boolean[], onChange?: (index: number, value: boolean) => any) {
        // Add buttons
        const msg = this.activeMessage;
        if (!msg) throw new Error("Message undefined");

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
        flags.forEach((_, index) => {
            this.onButton(`_${label}_${index}`, i => {
                values[index] = !values[index];
                onChange?.(index, values[index]);
                msg.updateAll(i);
            });
        });
    }

    addNumberInput(label: string, min: number, def: number, max: number, onChange?: (value: number) => any) {
        const msg = this.activeMessage;
        if (!msg) throw new Error("Message undefined");

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
        this.onButton(`_${label}_def`, i => {
            value = def;
            onChange?.(value);
            msg.updateAll(i);
        });
        this.onButton(`_${label}_dec`, i => {
            if (value > min) value -= 1;
            onChange?.(value);
            msg.updateAll(i);
        });
        this.onButton(`_${label}_inc`, i => {
            if (value < max) value += 1;
            onChange?.(value);
            msg.updateAll(i);
        });
    }
    
    addSupportedLogic() {
        if (this.leave) this.addLeaveLogic();
        if (this.join) this.addJoinLogic();
    }

    addJoinLogic() {
        this.onButton("_join", i => {
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

    addLeaveLogic() {
        this.onButton("_leave", i => {
            const index = this.players.indexOf(i.user);
            if (index === -1) {
                i.reply({ content: "You haven't even joined!", ephemeral: true });
                return;
            }
    
            this.players.splice(index, 1);
            this.leave?.(i, i.user, index);
        });
    }

    addLeaveButton(addRow = true) {
        // Add button
        const msg = this.activeMessage;
        if (!msg) throw new Error("Message undefined");

        const old = msg.message;
        msg.message = (channel, prev) => {
            const m = old(channel, prev);
            if (channel.type !== "DM") return m;

            m.components ??= [];
            if (addRow || m.components.length == 0) {
                m.components.push({
                    type: "ACTION_ROW",
                    components: [{
                        type: "BUTTON",
                        customId: "_leave",
                        label: "Leave",
                        style: "DANGER"
                    }]
                });
            } else {
                (m.components[0].components as MessageActionRowComponentResolvable[]).push({
                    type: "BUTTON",
                    customId: "_leave",
                    label: "Leave",
                    style: "DANGER"
                });
            }
            return m;
        };
        
        // Add button logic
        this.addLeaveLogic();
    }
    
    setSetupMessage(start: (i: ButtonInteraction) => void) {
        const msg = this.activeMessage;
        if (!msg) throw new Error("Message undefined");

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
        this.addLeaveLogic();
        this.addJoinLogic();

        this.onButton("_start", i => {
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

            start(i);
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
