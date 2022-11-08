import { Client, ColorResolvable, CommandInteraction, Message, MessageEmbedOptions, Snowflake, TextBasedChannel, User } from "discord.js";
import { shuffle } from "../util/card";
import { disableButtons, MessageController, MessageOptions, MessageSave } from "../util/message";
import { Serializable } from "../util/saving";
import { CAH } from "./cah/cah";
import { ContextOf, Event, forward, Game, Logic, MessageGenerator, sequence, UserInteraction } from "./logic";
import { writingTelephone } from "./sentencer/sentencer";
import { SetupLogic } from "./setup";

// Games
export const games: GameImpl<unknown>[] = [];
export const gametypes: {[key: string]: GameType<unknown>} = {};

function addGame(game: GameType<unknown>): void {
    gametypes[game.name] = game;
}

addGame(CAH);

const testedLogic = writingTelephone;

const testerSetup = new SetupLogic<ContextOf<typeof testedLogic>, []>([], ({ players, game }, i) => {
    game.closeLobby(undefined, i, ['_close']);
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
    color: "AQUA",
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
    lobby: TextBasedChannel;

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
                if (!c?.isText()) throw new Error();
                this.lobby = c;
            })
        );

        await Promise.all(promises);
    }

    start(i: CommandInteraction) {
        games.push(this);
        this.lobby = i.channel!;
        this.onEvent({ type: 'start', interaction: i });
    }

    end() {
        this.type.logic.onExit?.({ ctx: this.context, game: this, players: this.players });
        games.splice(games.indexOf(this), 1);

        if (this.lobby && this.lobby.isThread() && this.lobby.ownerId === process.env.CLIENT_ID) {
            this.lobby.setArchived(true, 'Game ended.');
        }
    }

    onEvent(event: Event) {
        this.type.logic.onEvent?.({ ctx: this.context, game: this, players: this.players }, event, () => this.end());
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

    async allowSpectators(): Promise<void> {
        const msg = Object.values(this.lobbyMessage.messages)[0].msg;
        this.lobby = msg.channel.isThread()
            ? msg.channel
            : await msg.startThread({ name: this.type.name, autoArchiveDuration: 60 });
    }

    isMyInteraction(i: UserInteraction) {
        return this.stateMessage.isMyInteraction(i) || this.lobbyMessage.isMyInteraction(i);
    }

    onMessage(m: Message) {
        this.onEvent({ type: 'dm', message: m });
    }

    onInteraction(i: UserInteraction) {
        if (i.isButton() && (i.customId === '_prevpage' || i.customId === '_nextpage')) {
            this.stateMessage.flipPage(i);
        } else {
            this.onEvent({ type: 'interaction', interaction: i });
        }
    }

    async send(players: User[], message: MessageGenerator | MessageOptions, sendSpectators = true): Promise<void> {
        const promises: Promise<Message>[] = [];

        const generator = typeof message === 'function' ? message : () => message;
        const generator2: MessageGenerator = user => {
            const m = generator(user);
            if (m.embeds)
                for (const embed of m.embeds)
                    embed.color ??= this.type.color;
            return m;
        }

        if (sendSpectators) {
            const p = this.lobby.send(generator2(null));
            if (p) promises.push(p)
        }

        for (const player of players) {
            promises.push(
                player.createDM().then(dm => dm.send(generator2(player)))
            );
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
    }

    async closeMessage(players: User[], message?: MessageGenerator | MessageOptions, i?: UserInteraction, closeSpectators = true): Promise<void> {
        const promises: Promise<unknown>[] = [];
        
        const generator = message ?
            (typeof message === 'function' ? message : () => message) :
            (_: unknown, channel: TextBasedChannel) => this.stateMessage.messages[channel.id]?.msg;
        const generator2 = (user: User | null, channel: TextBasedChannel) => {
            const m = generator(user, channel);
            if (!m) return undefined;

            const options = {
                embeds: m.embeds as MessageEmbedOptions[],
                components: m.components && disableButtons(m.components),
            };
            return options;
        }

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
    }

}

