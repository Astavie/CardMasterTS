"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameImpl = exports.gametypes = exports.games = void 0;
const card_1 = require("../util/card");
const message_1 = require("../util/message");
const cah_1 = require("./cah/cah");
const logic_1 = require("./logic");
const sentencer_1 = require("./sentencer/sentencer");
const setup_1 = require("./setup");
// Games
exports.games = [];
exports.gametypes = {};
function addGame(game) {
    exports.gametypes[game.name] = game;
}
addGame(cah_1.CAH);
const testedLogic = sentencer_1.writingTelephone;
const testerSetup = new setup_1.SetupLogic([], ({ players, game }, i) => {
    game.closeLobby(undefined, i, ['_close']);
    return {
        previous: Array(players.length).fill(null).map(() => []),
        context: {
            prompt: 'Antonyms',
            description: 'Write the opposite of the following sentence:',
        },
        shuffle: (0, card_1.shuffle)(players.map(p => p.id)),
        results: {},
    };
});
const logicTester = {
    name: "tester",
    color: "AQUA",
    logic: (0, logic_1.sequence)({
        setup: (0, logic_1.forward)(testerSetup, 'game'),
        game: testedLogic,
    }),
    initialContext: () => ({ state: 'setup', context: {} })
};
addGame(logicTester);
class GameImpl {
    players = [];
    lobby;
    type;
    context;
    lobbyMessage = new message_1.MessageController();
    stateMessage = new message_1.MessageController();
    constructor(type) {
        this.type = type;
        this.context = type.initialContext();
    }
    save() {
        return {
            game: this.type.name,
            players: this.players.map(p => p.id),
            lobbyMessage: this.lobbyMessage.save(),
            stateMessage: this.stateMessage.save(),
            context: this.context,
            lobby: this.lobby.id,
        };
    }
    async load(client, data) {
        this.context = data.context;
        const promises = [
            this.stateMessage.load(client, data.stateMessage),
            this.lobbyMessage.load(client, data.lobbyMessage),
        ];
        this.players = Array(data.players.length);
        for (let i = 0; i < this.players.length; i++) {
            promises.push(client.users.fetch(data.players[i]).then(p => this.players[i] = p));
        }
        if (data.lobby)
            promises.push(client.channels.fetch(data.lobby).then(c => {
                if (!c?.isText())
                    throw new Error();
                this.lobby = c;
            }));
        await Promise.all(promises);
    }
    start(i) {
        exports.games.push(this);
        this.lobby = i.channel;
        this.onEvent({ type: 'start', interaction: i });
    }
    end() {
        this.type.logic.onExit?.({ ctx: this.context, game: this, players: this.players });
        exports.games.splice(exports.games.indexOf(this), 1);
        if (this.lobby && this.lobby.isThread() && this.lobby.ownerId === process.env.CLIENT_ID) {
            this.lobby.setArchived(true, 'Game ended.');
        }
    }
    onEvent(event) {
        this.type.logic.onEvent?.({ ctx: this.context, game: this, players: this.players }, event, () => this.end());
    }
    addPlayer(player, i) {
        if (this.players.indexOf(player) !== -1)
            return false;
        this.players.push(player);
        this.onEvent({ type: 'add', player, interaction: i });
        return true;
    }
    removePlayer(player, i) {
        const idx = this.players.indexOf(player);
        if (idx === -1)
            return false;
        this.players.splice(idx, 1);
        this.onEvent({ type: 'remove', player, interaction: i });
        return true;
    }
    async allowSpectators() {
        const msg = Object.values(this.lobbyMessage.messages)[0].msg;
        this.lobby = msg.channel.isThread()
            ? msg.channel
            : await msg.startThread({ name: this.type.name, autoArchiveDuration: 60 });
    }
    isMyInteraction(i) {
        return this.stateMessage.isMyInteraction(i) || this.lobbyMessage.isMyInteraction(i);
    }
    onMessage(m) {
        this.onEvent({ type: 'dm', message: m });
    }
    onInteraction(i) {
        if (i.isButton() && (i.customId === '_prevpage' || i.customId === '_nextpage')) {
            this.stateMessage.flipPage(i);
        }
        else {
            this.onEvent({ type: 'interaction', interaction: i });
        }
    }
    async send(players, message, sendSpectators = true) {
        const promises = [];
        const generator = typeof message === 'function' ? message : () => message;
        const generator2 = user => {
            const m = generator(user);
            if (m.embeds)
                for (const embed of m.embeds)
                    embed.color ??= this.type.color;
            return m;
        };
        if (sendSpectators) {
            const p = this.lobby.send(generator2(null));
            if (p)
                promises.push(p);
        }
        for (const player of players) {
            promises.push(player.createDM().then(dm => dm.send(generator2(player))));
        }
        await Promise.all(promises);
    }
    async updateLobby(message, i) {
        if (message.embeds)
            for (const embed of message.embeds) {
                embed.title ??= this.type.name;
                embed.color ??= this.type.color;
            }
        await this.lobbyMessage.send(i?.channel ?? Object.values(this.lobbyMessage.messages)[0].msg.channel, message, i);
    }
    async closeLobby(message, i, keepButtons) {
        const lobbyMsg = Object.values(this.lobbyMessage.messages)[0].msg;
        const msg = message ?? lobbyMsg;
        const options = {
            embeds: msg.embeds,
            components: msg.components && (0, message_1.disableButtons)(msg.components, keepButtons),
        };
        if (i) {
            await i.update(options);
        }
        else {
            await lobbyMsg.edit(options);
        }
    }
    async updateMessage(players, message, i, sendSpectators = true) {
        const promises = [];
        const generator = typeof message === 'function' ? message : () => message;
        const generator2 = user => {
            const m = generator(user);
            if (m.embeds) {
                for (const embed of m.embeds) {
                    embed.title ??= this.type.name;
                    embed.color ??= this.type.color;
                }
            }
            return m;
        };
        if (sendSpectators) {
            const msg = generator2(null);
            promises.push(this.stateMessage.send(this.lobby, msg, i?.channel === this.lobby ? i : undefined));
        }
        for (const player of players) {
            const msg = generator2(player);
            promises.push(player.createDM().then(dm => this.stateMessage.send(dm, msg, i?.channel === dm ? i : undefined)));
        }
        await Promise.all(promises);
    }
    async closeMessage(players, message, i, closeSpectators = true) {
        const promises = [];
        const generator = message ?
            (typeof message === 'function' ? message : () => message) :
            (_, channel) => this.stateMessage.messages[channel.id]?.msg;
        const generator2 = (user, channel) => {
            const m = generator(user, channel);
            if (!m)
                return undefined;
            const options = {
                embeds: m.embeds,
                components: m.components && (0, message_1.disableButtons)(m.components),
            };
            return options;
        };
        if (closeSpectators) {
            const msg = generator2(null, this.lobby);
            if (msg) {
                promises.push(this.stateMessage.send(this.lobby, msg, i?.channel === this.lobby ? i : undefined).then(() => {
                    delete this.stateMessage.messages[this.lobby.id];
                }));
            }
        }
        for (const player of players) {
            promises.push(player.createDM().then(async (dm) => {
                const msg = generator2(player, dm);
                if (msg) {
                    await this.stateMessage.send(dm, msg, i?.channel === dm ? i : undefined);
                    delete this.stateMessage.messages[dm.id];
                }
            }));
        }
        await Promise.all(promises);
    }
}
exports.GameImpl = GameImpl;
