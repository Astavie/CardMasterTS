import { Client, CommandInteraction, Message, Snowflake, TextBasedChannel, User } from "discord.js";
import { loadPack } from "../db";
import { escapeDiscord } from "../util/card";
import { disableButtons, MessageController, MessageOptions, MessageSave } from "../util/message";
import { Serializable } from "../util/saving";
import { CAH } from "./cah/cah";
import { JJ } from "./jj/jj";
import { Event, Game, GameType, MessageGenerator, Pack, UserInteraction } from "./logic";

// Games
export const games: {[key:string]: GameImpl<unknown>[]} = {};
export const gametypes: {[key: string]: GameType<unknown>} = {};

function addGame(game: GameType<unknown>): void {
    gametypes[game.name] = game;
}

addGame(CAH);
addGame(JJ);

// Impl
export type GameSave<C> = {
    game: string,
    players: Snowflake[],
    lobbyMessage: MessageSave,
    stateMessage: MessageSave,
    context: C,
    lobby?: Snowflake,
}

const packs: {[key:string]:{[key:string]:Pack}} = {};

function escapePack(p: Pack) {
    p.cards.white = p.cards.white.map(escapeDiscord);
    p.cards.black = p.cards.black.map(c => typeof(c) === 'string' ? escapeDiscord(c) : { ...c, text: escapeDiscord(c.text) });
    return p;
}

async function getPackAsync(guildid: Snowflake, pack: string): Promise<Pack> {
    packs[guildid] ??= {};
    packs[guildid][pack] ??= escapePack(await loadPack(guildid, pack));
    return packs[guildid][pack];
}

export class GameImpl<C> implements Game, Serializable<GameSave<C>> {

    players: User[] = [];
    lobby: TextBasedChannel;

    type: GameType<C>;
    context: C;

    ended: boolean = false;
    guild: Snowflake;

    lobbyMessage: MessageController = new MessageController();
    stateMessage: MessageController = new MessageController();

    generator: Generator<void, unknown, Event>;

    queue: Promise<unknown> = Promise.resolve();

    processing: boolean = false;
    eventQueue: Event[] = [];

    constructor(type: GameType<C>, guild: Snowflake) {
        this.type = type;
        this.context = type.initialContext();
        this.guild = guild;
    }

    getPack(id: string) {
        return packs[this.guild]?.[id] ?? null;
    }

    loadPack(id: string) {
        getPackAsync(this.guild, id).then(pack => {
            packs[this.guild][pack.rawname] = pack;
            this.onEvent({ type: 'pack_loaded', id });
        });
    }

    enqueue(elem: Promise<unknown> | (() => Promise<unknown>)) {
        const func = typeof(elem) === 'function' ? elem : async () => await elem;
        this.queue = this.queue.then(func);
    }

    save(): GameSave<C> {
        return {
            game: this.type.name,
            players: this.players.map(p => p.id),
            lobbyMessage: this.lobbyMessage.save(),
            stateMessage: this.stateMessage.save(),
            context: this.context,
            lobby: this.lobby.id,
        }
    }

    getGuild() {
        return this.guild;
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
                if (!c?.isTextBased()) throw new Error();
                this.lobby = c;
            })
        );

        await Promise.all(promises);

        this.generator = this.type.logic(this, this.players, this.context);
        this.generator.next();
    }

    start(i: CommandInteraction) {
        games[this.guild] ??= [];
        games[this.guild].push(this);
        this.lobby = i.channel!;

        // start logic
        this.generator = this.type.logic(this, this.players, this.context);
        this.generator.next();
        this.onEvent({ type: 'start', interaction: i });
    }

    end() {
        this.ended = true;
        games[this.guild].splice(games[this.guild].indexOf(this), 1);

        this.enqueue(async () => {
            if (this.lobby && this.lobby.isThread()) {
                await this.lobby.setArchived(true, 'Game ended.');
            }
        });
    }

    onEvent(event: Event) {
        if (this.ended) {
            return;
        }
        this.eventQueue.push(event);
        if (this.processing) {
            return;
        }

        try {
            this.processing = true;
            while (this.eventQueue.length) {
                const queue = this.eventQueue;
                this.eventQueue = [];

                for (const event of queue) {
                    const next = this.generator.next(event);
                    if (next.done) {
                        this.end();
                        return;
                    }
                }
            }
            this.processing = false;
        } catch (error) {
            const now = new Date().toLocaleString();
            console.error(`--- ERROR ---`);
            console.error(error)
            console.error(`encountered during a game of "${this.type.name}" inside guild ${this.guild} at ${now}`);
            console.error(`event: %O`, event)
            console.error(`game.context: %O`, this.context)
            console.error(`-------------`);
            
            this.report(`An error occurred while running the game, causing the game to close prematurely\nPlease report this to Astavie#2920 with the timestamp ${now}`)
            this.end()
        }
    }
    
    report(message: string) {
        let promises: Promise<unknown>[] = [];

        const p = this.lobby.send(message);
        if (p) promises.push(p)

        for (const player of this.players) {
            promises.push(player.createDM().then(dm => dm.send(message)));
        }

        // Ignore any errors at this point
        promises = promises.map(p => p.catch(() => {}));
        
        this.enqueue(Promise.all(promises));
    }
    
    addPlayer(player: User, i?: UserInteraction): boolean {
        if (this.players.indexOf(player) !== -1) return false;

        this.players.push(player);
        this.onEvent({ type: 'add', player, interaction: i });
        return true;
    }

    removePlayer(player: User, i?: UserInteraction): boolean {
        const idx = this.players.indexOf(player);
        if (idx === -1) return false;

        this.players.splice(idx, 1);
        this.onEvent({ type: 'remove', player, interaction: i });
        return true;
    }

    allowSpectators() {
        const msg = Object.values(this.lobbyMessage.messages)[0].msg;
        this.enqueue(msg.startThread({ name: this.type.name, autoArchiveDuration: 60 }).then(t => {
            this.lobby = t;
        }));
    }

    isMyInteraction(i: UserInteraction) {
        return this.stateMessage.isMyInteraction(i) || this.lobbyMessage.isMyInteraction(i);
    }

    onMessage(m: Message) {
        this.onEvent({ type: 'dm', message: m });
    }

    onInteraction(i: UserInteraction) {
        if (i.isButton() && (i.customId === '_prevpage' || i.customId === '_nextpage')) {
            this.enqueue(this.stateMessage.flipPage(i));
        } else {
            this.onEvent({ type: 'interaction', interaction: i });
        }
    }

    send(players: User[], message: MessageGenerator | MessageOptions, sendSpectators = true) {
        const generator = typeof message === 'function' ? message : () => message;
        const generator2: MessageGenerator = user => {
            const m = generator(user);
            if (m.embeds)
                for (const embed of m.embeds)
                    embed.color ??= this.type.color;
            return m;
        }

        this.enqueue(async () => {
            const promises: Promise<unknown>[] = [];
            if (sendSpectators) {
                const p = this.lobby.send(generator2(null));
                if (p) promises.push(p)
            }

            for (const player of players) {
                promises.push(player.createDM().then(dm => dm.send(generator2(player))));
            }
            await Promise.all(promises);
        });
    }

    updateLobby(message: MessageOptions, i?: UserInteraction | CommandInteraction) {
        if (message.embeds) for (const embed of message.embeds) {
            embed.title ??= this.type.name;
            embed.color ??= this.type.color;
        }

        this.enqueue(async () => {
            await this.lobbyMessage.send(
                i?.channel ?? Object.values(this.lobbyMessage.messages)[0].msg.channel,
                message,
                i
            );
        });
    }

    closeLobby(message?: MessageOptions, i?: UserInteraction, keepButtons?: string[]) {
        this.enqueue(async () => {
            const lobbyMsg = Object.values(this.lobbyMessage.messages)[0].msg;
            const components = message?.components ?? lobbyMsg.components.map(c => c.toJSON());
            const options = {
                embeds: message?.embeds ?? lobbyMsg.embeds,
                components: disableButtons(components, keepButtons),
            };

            if (i) {
                await i.update(options);
            } else {
                await lobbyMsg.edit(options);
            }
        });
    }

    updateMessage(players: User[], message: MessageOptions | MessageGenerator, i?: UserInteraction, sendSpectators = true) {
        const generator = typeof message === 'function' ? message : () => message;
        const generator2: MessageGenerator = user => {
            const m = generator(user);
            if (m.embeds) {
                for (const embed of m.embeds) {
                    embed.title ??= this.type.name;
                    embed.color ??= this.type.color;
                }
            }
            return m;
        }

        this.enqueue(async () => {
            const promises: Promise<void>[] = [];
            if (sendSpectators) {
                const msg = generator2(null);
                promises.push(this.stateMessage.send(
                    this.lobby,
                    msg, 
                    i?.channel === this.lobby ? i : undefined
                ));
            }
            for (const player of players) {
                const msg = generator2(player);
                promises.push(player.createDM().then(dm => this.stateMessage.send(
                    dm,
                    msg,
                    i?.channel === dm ? i : undefined
                )));
            }
            await Promise.all(promises);
        });
    }

    closeMessage(players: User[], message?: MessageGenerator | MessageOptions, i?: UserInteraction, closeSpectators = true) {
        const generator = message ?
            (typeof message === 'function' ? message : () => message) :
            (_: unknown, channel: TextBasedChannel) => {
                const msg = this.stateMessage.messages[channel.id]?.msg;
                return {
                    embeds: msg.embeds.map(e => e.toJSON()),
                    components: msg.components.map(c => c.toJSON()),
                };
            };
        const generator2 = (user: User | null, channel: TextBasedChannel) => {
            const m = generator(user, channel);
            if (!m) return undefined;

            const options = {
                embeds: m.embeds,
                components: m.components && disableButtons(m.components),
            };
            if (options.embeds) {
                for (const embed of options.embeds) {
                    embed.title ??= this.type.name;
                    embed.color ??= this.type.color;
                }
            }
            return options;
        }

        this.enqueue(async () => {
            const promises: Promise<unknown>[] = [];
            if (closeSpectators) {
                const msg = generator2(null, this.lobby);
                if (msg) {
                    promises.push(this.stateMessage.send(
                        this.lobby,
                        msg, 
                        i?.channel === this.lobby ? i : undefined
                    ).then(() => {
                        delete this.stateMessage.messages[this.lobby.id];
                    }));
                }
            }
            for (const player of players) {
                promises.push(player.createDM().then(async dm => {
                    const msg = generator2(player, dm);
                    if (msg) {
                        await this.stateMessage.send(
                            dm,
                            msg,
                            i?.channel === dm ? i : undefined
                        );
                        delete this.stateMessage.messages[dm.id];
                    }
                }));
            }
            await Promise.all(promises);
        });
    }

}

