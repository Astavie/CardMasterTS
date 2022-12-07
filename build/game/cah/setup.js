"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupLogic = exports.packs = void 0;
const card_1 = require("../../util/card");
const setup_1 = require("../setup");
const cah_1 = require("./cah");
const cahstandard_1 = require("./packs/cahstandard");
// Global packs
exports.packs = [
    escapePack({ name: "CAH Base", cards: cahstandard_1.basePack }),
    escapePack({ name: "CAH Full", cards: cahstandard_1.fullPack }),
];
// Packs inside .gitignore
function conditionalRequire(name) {
    try {
        return require(name);
    }
    catch { }
    return undefined;
}
const eppgroep = conditionalRequire("./packs/eppgroep")?.eppgroep;
if (eppgroep) {
    const epack = escapePack({
        name: "EPPGroep",
        cards: eppgroep,
    });
    exports.packs.push(epack);
    exports.packs.push(epack);
}
function escapePack(p) {
    p.cards.white = p.cards.white.map(card_1.escapeDiscord);
    p.cards.black = p.cards.black.map(card_1.escapeDiscord);
    return p;
}
const config = [{
        type: 'choice',
        name: 'Packs',
        values: exports.packs.map(pack => ({ label: pack.name })),
        default: eppgroep ? [0, 2, 3] : [0],
        min: 1,
        max: Number.MAX_SAFE_INTEGER,
    }, {
        type: 'flags',
        name: 'Rules',
        values: ['Rando Cardrissian', 'Double or nothing', 'Quiplash mode'],
        default: [true, true, false],
    }, {
        type: 'number',
        name: 'Max points',
        min: 1,
        max: Number.MAX_SAFE_INTEGER,
        default: 9,
    }, {
        type: 'number',
        name: 'Hand cards',
        min: 1,
        max: 20,
        default: 10,
    }];
exports.setupLogic = new setup_1.SetupLogic(config, startGame, ({ ctx, players }) => {
    const splayers = players.map(player => player.toString());
    if (ctx['Rules'][0])
        splayers.unshift('`Rando Cardrissian`');
    return { fields: [{
                name: 'Players',
                value: splayers.join('\n') || '*None.*',
            }] };
});
async function startGame({ ctx, players, game }, i) {
    if (players.length < 2) {
        i.reply({
            content: 'You need at least two players to start.',
            ephemeral: true
        });
        return null;
    }
    const whiteDeck = [];
    const blackDeck = [];
    for (const pack of ctx['Packs']) {
        for (let i = 0; i < exports.packs[pack].cards.white.length; i++)
            whiteDeck.push([pack, i]);
        for (let i = 0; i < exports.packs[pack].cards.black.length; i++)
            blackDeck.push([pack, i]);
    }
    (0, card_1.shuffle)(whiteDeck);
    (0, card_1.shuffle)(blackDeck);
    const blackCard = blackDeck.pop();
    if (!blackCard) {
        i.reply({
            content: 'The selected packs do not contain any black cards.',
            ephemeral: true
        });
        return null;
    }
    const prompt = (0, cah_1.realizeBlackCard)(blackCard, players);
    const blanks = (0, card_1.countBlanks)((0, cah_1.getBlackCard)(prompt));
    let totalCards = ctx['Hand cards'] * players.length;
    if (ctx['Rules'][0])
        totalCards += blanks;
    if (whiteDeck.length < totalCards) {
        i.reply({
            content: 'There are not enough white cards in the selected packs to start the game.',
            ephemeral: true
        });
        return null;
    }
    // LET'S GO
    game.closeLobby(undefined, i, ['_join', '_leave', '_close']);
    await game.allowSpectators();
    // rando's cards
    const points = Object.fromEntries(players.map(player => [player.id, 0]));
    let randoPlaying = null;
    if (ctx['Rules'][0]) {
        points[cah_1.randoId] = 0;
        randoPlaying = [];
        while (randoPlaying.length < blanks) {
            const card = whiteDeck.pop();
            randoPlaying.push((0, cah_1.realizeWhiteCard)(card, players));
        }
    }
    let round;
    if (ctx['Rules'][2]) {
        const playing = Object.fromEntries(players.map(player => [player.id, null]));
        delete playing[players[0].id];
        if (randoPlaying) {
            playing[cah_1.randoId] = randoPlaying.map(cah_1.getWhiteCard);
        }
        round = {
            quiplash: true,
            maxPoints: ctx['Max points'],
            czar: 0,
            points,
            playing,
            whiteDeck,
            blackDeck,
            prompt,
            shuffle: [],
        };
    }
    else {
        const hand = {};
        for (const player of players) {
            const phand = [];
            hand[player.id] = phand;
            while (phand.length < ctx['Hand cards']) {
                const card = whiteDeck.pop();
                phand.push((0, cah_1.realizeWhiteCard)(card, players));
            }
        }
        const playing = Object.fromEntries(players.map(player => [player.id, Array(blanks).fill(null)]));
        delete playing[players[0].id];
        if (randoPlaying) {
            hand[cah_1.randoId] = randoPlaying;
            playing[cah_1.randoId] = [...Array(blanks).keys()];
        }
        round = {
            quiplash: false,
            doubleornothing: ctx['Rules'][1] ? {} : undefined,
            handCards: ctx['Hand cards'],
            maxPoints: ctx['Max points'],
            czar: 0,
            points,
            playing,
            whiteDeck,
            blackDeck,
            prompt,
            shuffle: [],
            hand,
        };
    }
    return {
        state: 'hand',
        context: round,
    };
}
