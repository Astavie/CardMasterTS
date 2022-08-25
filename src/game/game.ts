import { ButtonInteraction, ColorResolvable, BaseCommandInteraction, Message, SelectMenuInteraction, User, MessageActionRowComponentOptions, TextBasedChannel, ThreadChannel, ModalSubmitInteraction, MessageActionRowComponentResolvable, MessageComponentInteraction, Snowflake, Client } from "discord.js";
import { MessageController, MessageGenerator, MessageOptions, MessageSave } from "../util/message";
import { CAH } from "./cah/cah";

// Games
export const gameInstances: GameInstance<any, any>[] = [];
export const games: {[key: string]: Game<any, any>} = {};

function addGame(game: Game<any, any>): void {
    games[game.name] = game;
}

addGame(CAH);

// Classes
export type Game<Context extends object, State extends string> = {
    name: string,
    color: ColorResolvable,
    playedInDms: boolean,
    createContext: () => Context,

    setup: (game: GameInstance<Context, State>) => void,
    resume: {[s in State]: (game: GameInstance<Context, State>) => void},
    change: {[s in State]?: (game: GameInstance<Context, State>) => void},
}


export type GameSave<Context extends object, State extends string> = {
    game: string,
    players: Snowflake[],
    setupMessage: MessageSave,
    activeMessage: MessageSave,
    state: State,
    context: Context,
    lobby?: Snowflake,
}

export class GameInstance<Context extends object, State extends string> {

    buttons: {[key:string]: (i: ButtonInteraction) => Promise<State> | null} = {};
    select:  {[key:string]: (i: SelectMenuInteraction) => Promise<State> | null} = {};
    modals:  {[key:string]: (i: ModalSubmitInteraction) => Promise<State> | null} = {};

    join?: (i: ButtonInteraction, player: User) => Promise<State> | null;
    leave?: (i: ButtonInteraction, player: User, index: number) => Promise<State> | null;
    maxPlayers: () => number = () => Number.MAX_SAFE_INTEGER;
    minPlayers: () => number = () => 0;

    game: Game<Context, State>;

    // The following will be saved to a file
    players: User[] = [];
    setupMessage: MessageController = new MessageController();
    activeMessage: MessageController = new MessageController();
    context: Context;

    lobby?: TextBasedChannel;
    state?: State;

    constructor(game: Game<Context, State>) {
        this.game = game;
        this.context = game.createContext();
    }

    save(): GameSave<Context, State> {
        return {
            game: this.game.name,
            players: this.players.map(p => p.id),
            setupMessage: this.setupMessage.save(),
            activeMessage: this.activeMessage.save(),
            state: this.state!,
            context: this.context,
            lobby: this.lobby?.id,
        }
    }

    async load(client: Client, save: GameSave<Context, State>) {
        this.state = save.state;
        this.context = save.context;

        const setup = new MessageController();
        const active = new MessageController();

        const promises: Promise<any>[] = [
            setup.load(client, save.setupMessage),
            active.load(client, save.activeMessage),
        ];

        this.players = Array(save.players.length);
        for (let i = 0; i < this.players.length; i++) {
            promises.push(client.users.fetch(save.players[i]).then(u => this.players[i] = u));
        }

        if (save.lobby) promises.push(
            client.channels.fetch(save.lobby).then(c => {
                if (!c?.isText()) return;
                this.lobby = c;
            })
        )

        await Promise.all(promises);
    
        this.activeMessage = setup;
        this.game.setup(this);
        this.resetControls();
        this.activeMessage = active;
        this.game.resume[this.state!](this);
    }

    start(i: BaseCommandInteraction) {
        gameInstances.push(this);
        this.resetControls();
        this.game.setup(this);
        this.setupMessage.reply(i);
    }

    change(s: State) {
        this.state = s;
        this.resetControls();
        this.game.resume[s](this);
        this.game.change[s]?.(this);
    }

    kill() {
        this.activeMessage.endAll();
        this.setupMessage.endAll();
        gameInstances.splice(gameInstances.indexOf(this), 1);

        // archive created thread
        if (this.lobby && this.lobby.isThread() && this.lobby.ownerId === process.env.CLIENT_ID) {
            this.lobby.setArchived(true, "Game ended.");
        }
    }

    isMyInteraction(i: MessageComponentInteraction | ModalSubmitInteraction) {
        return this.activeMessage.isMyInteraction(i) || this.setupMessage.isMyInteraction(i);
    }

    onButton(button: string, callback: (i: ButtonInteraction) => Promise<State> | null) {
        this.buttons[button] = callback;
    }

    resolveButton(inter: ButtonInteraction) {
        const state = this.buttons[inter.customId]?.(inter);
        if (state) state.then(s => this.change(s));
    }

    onModal(modal: string, callback: (i: ModalSubmitInteraction) => Promise<State> | null) {
        this.modals[modal] = callback;
    }

    resolveModal(inter: ModalSubmitInteraction) {
        const state = this.modals[inter.customId]?.(inter);
        if (state) state.then(s => this.change(s));
    }

    onSelect(button: string, callback: (i: SelectMenuInteraction) => Promise<State> | null) {
        this.select[button] = callback;
    }

    resolveSelect(inter: SelectMenuInteraction) {
        const state = this.select[inter.customId]?.(inter);
        if (state) state.then(s => this.change(s));
    }

    resetControls() {
        this.buttons = {};
        this.select = {};
        this.modals = {};
        this.join = undefined;
        this.leave = undefined;

        // Page flip buttons
        this.buttons["_prevpage"] = i => {
            if (!this.activeMessage.pages[i.channel!.id]) this.activeMessage.pages[i.channel!.id] = { page: 0 };

            const p = this.activeMessage.pages[i.channel!.id]!;
            p.page -= 1;
            if (p.page < 0) p.page = 0;

            if (!p.pages) {
                this.activeMessage.update(i);
            } else {
                i.update(p.pages[p.page]);
            }
            return null;
        };
        this.buttons["_nextpage"] = i => {
            if (!this.activeMessage.pages[i.channel!.id]) this.activeMessage.pages[i.channel!.id] = { page: 0 };

            const p = this.activeMessage.pages[i.channel!.id]!;
            p.page += 1;

            if (!p.pages) {
                this.activeMessage.update(i);
            } else {
                if (p.page >= p.pages.length) p.page = p.pages.length - 1;
                i.update(p.pages[p.page]);
            }
            return null;
        };
    }

    async startLobby(msg: Message): Promise<ThreadChannel> {
        this.lobby = msg.channel.isThread() ? msg.channel : await msg.startThread({ name: CAH.name, autoArchiveDuration: 60 });
        return this.lobby;
    }

    // easy to use messages
    sendPrivate(message?: MessageGenerator): Promise<Message[]> {
        let send: (c: TextBasedChannel) => Promise<Message>;
        if (message) {
            send = c => c.send(message(c));
        } else {
            const msg = this.activeMessage;
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

    addFlagsInput(label: string, flags: string[], values: boolean[], onChange?: (index: number, value: boolean) => Promise<State> | null) {
        // Add buttons
        const msg = this.activeMessage;

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
                const ret = onChange?.(index, values[index]) ?? null;
                msg.updateAll(i);
                return ret;
            });
        });
    }

    addNumberInput(label: string, min: number, def: number, max: number, onChange?: (value: number) => Promise<State> | null) {
        const msg = this.activeMessage;

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
            const ret = onChange?.(value) ?? null;
            msg.updateAll(i);
            return ret;
        });
        this.onButton(`_${label}_dec`, i => {
            if (value > min) value -= 1;
            const ret = onChange?.(value) ?? null;
            msg.updateAll(i);
            return ret;
        });
        this.onButton(`_${label}_inc`, i => {
            if (value < max) value += 1;
            const ret = onChange?.(value) ?? null;
            msg.updateAll(i);
            return ret;
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
                return null;
            }
            if (this.players.length >= max) {
                i.reply({ content: "Game is already full!", ephemeral: true });
                return null;
            }
    
            return this.join?.(i, i.user) ?? null;
        });
    }

    addLeaveLogic() {
        this.onButton("_leave", i => {
            const index = this.players.indexOf(i.user);
            if (index === -1) {
                i.reply({ content: "You haven't even joined!", ephemeral: true });
                return null;
            }
    
            return this.leave?.(i, i.user, index) ?? null;
        });
    }

    addLeaveButton(addRow = true) {
        // Add button
        const msg = this.activeMessage;

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
    }
    
    setSetupMessage(start: (i: ButtonInteraction) => Promise<State> | null) {
        const msg = this.activeMessage;

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
                return null;
            }
            if (this.players.length > max) {
                i.reply({ content: "Too many players!", ephemeral: true });
                return null;
            }

            return start(i);
        });

        this.setupMessage = msg;
        this.activeMessage = new MessageController();
    }

}

export function shuffle<T>(a: T[]): T[] {
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}
