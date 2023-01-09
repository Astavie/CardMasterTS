import { APIEmbed, Client, CommandInteraction, Message, Snowflake, TextBasedChannel, User } from "discord.js";
import { shuffle } from "../util/card";
import { disableButtons, MessageController, MessageOptions, MessageSave } from "../util/message";
import { Serializable } from "../util/saving";
import { CAH } from "./cah/cah";
import { ContextOf, Event, forward, Game, Logic, MessageGenerator, sequence, UserInteraction } from "./logic";
import { writingTelephone } from "./sentencer/sentencer";
import { SetupLogic } from "./setup";

// Games
export const games: {[key:string]: GameImpl<unknown>[]} = {};
export const gametypes: {[key: string]: GameType<unknown>} = {};

function addGame(game: GameType<unknown>): void {
    gametypes[game.name] = game;
}

addGame(CAH);

const testedLogic = writingTelephone;

const testerSetup = new SetupLogic<ContextOf<typeof testedLogic>, []>([], {}, async ({ players, game }, i) => {
    await game.closeLobby(undefined, i, ['_close']);
    return {
        previous: Array(players.length).fill(null).map(() => []),
        context: {
            prompt: 'Antonyms',
            description: 'Write the opposite of the following sentence:',
        },
        shuffle: shuffle(players.map(p => p.id)),
        results: {},
    };
});

const logicTester: GameType<unknown> = {
    name: "tester",
    color: 0x00FFFF,
    logic: sequence({
        setup: forward(testerSetup, 'game'),
        game: testedLogic,
    }),
    initialContext: () => ({ state: 'setup', context: {} })
}

addGame(logicTester);

// Impl
export type GameType<C> = {
    name: string,
    color: number,
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
    lobby: TextBasedChannel;

    type: GameType<C>;
    context: C;

    guild: Snowflake;

    lobbyMessage: MessageController = new MessageController();
    stateMessage: MessageController = new MessageController();

    constructor(type: GameType<C>, guild: Snowflake) {
        this.type = type;
        this.context = type.initialContext();
        this.guild = guild;
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
    }

    async start(i: CommandInteraction) {
        games[this.guild] ??= [];
        games[this.guild].push(this);
        this.lobby = i.channel!;
        await this.onEvent({ type: 'start', interaction: i });
    }

    async end() {
        try {
            await this.type.logic.onExit?.({ ctx: this.context, game: this, players: this.players, guildid: this.guild })
        } catch (error) {
            const now = new Date().toLocaleString();
            console.error(`--- ERROR ---`);
            console.error(error);
            console.error(`encountered while ending a game of "${this.type.name}" inside guild ${this.guild} at ${now}`);
            console.error(`game.context: ${JSON.stringify(this.context)}`)
            console.error(`-------------`);

            await this.report(`An error occurred while closing the game\nPlease report this to Astavie#2920 with the timestamp ${now}`)
        }
        
        games[this.guild].splice(games[this.guild].indexOf(this), 1);
        
        if (this.lobby && this.lobby.isThread()) {
            this.lobby.setArchived(true, 'Game ended.');
        }
    }

    async onEvent(event: Event) {
        try {
            await this.type.logic.onEvent?.({ ctx: this.context, game: this, players: this.players, guildid: this.guild }, event, () => this.end())
        } catch (error) {
            const now = new Date().toLocaleString();
            console.error(`--- ERROR ---`);
            console.error(error)
            console.error(`encountered during a game of "${this.type.name}" inside guild ${this.guild} at ${now}`);
            console.error(`event: ${JSON.stringify(event)}`)
            console.error(`game.context: ${JSON.stringify(this.context)}`)
            console.error(`-------------`);
            
            await this.report(`An error occurred while running the game, causing the game to close prematurely\nPlease report this to Astavie#2920 with the timestamp ${now}`)
            await this.end()
        }
    }
    
    async report(message: string) {
        let promises: Promise<unknown>[] = [];

        const p = this.lobby.send(message);
        if (p) promises.push(p)

        for (const player of this.players) {
            promises.push((async () => {
                (await player.createDM()).send(message);
            })());
        }

        // Ignore any errors at this point
        promises = promises.map(p => p.catch(() => {}));
        
        await Promise.all(promises);
    }
    
    async addPlayer(player: User, i?: UserInteraction): Promise<boolean> {
        if (this.players.indexOf(player) !== -1) return false;
        
        this.players.push(player);
        await this.onEvent({ type: 'add', player, interaction: i });
        return true;
    }

    async removePlayer(player: User, i?: UserInteraction): Promise<boolean> {
        const idx = this.players.indexOf(player);
        if (idx === -1) return false;

        this.players.splice(idx, 1);
        await this.onEvent({ type: 'remove', player, interaction: i });
        return true;
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

    async onMessage(m: Message) {
        await this.onEvent({ type: 'dm', message: m });
    }

    async onInteraction(i: UserInteraction) {
        if (i.isButton() && (i.customId === '_prevpage' || i.customId === '_nextpage')) {
            await this.stateMessage.flipPage(i);
        } else {
            await this.onEvent({ type: 'interaction', interaction: i });
        }
    }

    async send(players: User[], message: MessageGenerator | MessageOptions, sendSpectators = true): Promise<void> {
        const promises: Promise<unknown>[] = [];

        const generator = typeof message === 'function' ? message : () => message;
        const generator2: MessageGenerator = async user => {
            const m = await generator(user);
            if (m.embeds)
                for (const embed of m.embeds)
                    embed.color ??= this.type.color;
            return m;
        }

        if (sendSpectators) {
            const p = this.lobby.send(await generator2(null));
            if (p) promises.push(p)
        }

        for (const player of players) {
            promises.push((async () => {
                (await player.createDM()).send(await generator2(player));
            })());
        }

        await Promise.all(promises);
    }

    async updateLobby(message: MessageOptions, i?: UserInteraction | CommandInteraction): Promise<void> {
        if (message.embeds) for (const embed of message.embeds) {
            embed.title ??= this.type.name;
            embed.color ??= this.type.color;
        }
        await this.lobbyMessage.send(
            i?.channel ?? Object.values(this.lobbyMessage.messages)[0].msg.channel,
            message,
            i
        );
    }

    async closeLobby(message?: MessageOptions, i?: UserInteraction, keepButtons?: string[]): Promise<void> {
        const lobbyMsg = Object.values(this.lobbyMessage.messages)[0].msg;
        const msg = message ?? lobbyMsg;
        const options = {
            embeds: msg.embeds,
            components: msg.components && disableButtons(msg.components, keepButtons),
        };
        if (i) {
            await i.update(options);
        } else {
            await lobbyMsg.edit(options);
        }
    }

    async updateMessage(players: User[], message: MessageOptions | MessageGenerator, i?: UserInteraction, sendSpectators = true): Promise<void> {
        const promises: Promise<void>[] = [];
        
        const generator = typeof message === 'function' ? message : () => message;
        const generator2: MessageGenerator = async user => {
            const m = await generator(user);
            if (m.embeds) {
                for (const embed of m.embeds) {
                    embed.title ??= this.type.name;
                    embed.color ??= this.type.color;
                }
            }
            return m;
        }

        if (sendSpectators) {
            const msg = await generator2(null);
            promises.push(this.stateMessage.send(
                this.lobby,
                msg, 
                i?.channel === this.lobby ? i : undefined
            ));
        }

        for (const player of players) {
            const msg = await generator2(player);
            promises.push(player.createDM().then(dm => this.stateMessage.send(
                dm,
                msg,
                i?.channel === dm ? i : undefined
            )));
        }

        await Promise.all(promises);
    }

    async closeMessage(players: User[], message?: MessageGenerator | MessageOptions, i?: UserInteraction, closeSpectators = true): Promise<void> {
        const promises: Promise<unknown>[] = [];
        
        const generator = message ?
            (typeof message === 'function' ? message : () => message) :
            (_: unknown, channel: TextBasedChannel) => this.stateMessage.messages[channel.id]?.msg;
        const generator2 = async (user: User | null, channel: TextBasedChannel) => {
            const m = await generator(user, channel);
            if (!m) return undefined;

            const options = {
                embeds: m.embeds as APIEmbed[],
                components: m.components && disableButtons(m.components),
            };
            return options;
        }

        if (closeSpectators) {
            const msg = await generator2(null, this.lobby);
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
                const msg = await generator2(player, dm);
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
    }

}

