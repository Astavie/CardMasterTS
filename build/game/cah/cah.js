"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CAH = exports.realizeBlackCard = exports.realizeWhiteCard = exports.getBlackCard = exports.getWhiteCard = exports.randoId = exports.getPointsList = exports.getPlayerList = void 0;
const crypto_1 = require("crypto");
const card_1 = require("../../util/card");
const logic_1 = require("../logic");
const game_1 = require("./game");
const hand_1 = require("./hand");
const read_1 = require("./read");
const setup_1 = require("./setup");
function getPlayerList(players, rando) {
    const ids = players.map(p => p.toString());
    if (rando) {
        ids.unshift("`Rando Cardrissian`");
    }
    return ids.length > 0 ? ids.join("\n") : "*None*";
}
exports.getPlayerList = getPlayerList;
function getPointsList(players, points, maxPoints) {
    const ids = players.map(p => "`" + points[p.id].toString().padStart(2) + "` " + p.toString());
    if (exports.randoId in points) {
        ids.unshift("`" + points[exports.randoId].toString().padStart(2) + "` `Rando Cardrissian`");
    }
    return ids.join("\n") + (maxPoints ? "\n`" + maxPoints.toString().padStart(2) + "` points to win" : "");
}
exports.getPointsList = getPointsList;
exports.randoId = "rando";
function getWhiteCard(card) {
    return (0, card_1.realizeCard)(setup_1.packs[card[0]].cards.white[card[1]], card[2]);
}
exports.getWhiteCard = getWhiteCard;
function getBlackCard(card) {
    return (0, card_1.realizeCard)(setup_1.packs[card[0]].cards.black[card[1]], card[2]);
}
exports.getBlackCard = getBlackCard;
function realizeWhiteCard(card, players) {
    if (card[2])
        return card;
    const spots = (0, card_1.countRealizations)(setup_1.packs[card[0]].cards.white[card[1]]);
    const fills = [];
    for (let i = 0; i < spots; i++) {
        fills.push(players[(0, crypto_1.randomInt)(players.length)].toString());
    }
    return [card[0], card[1], fills];
}
exports.realizeWhiteCard = realizeWhiteCard;
function realizeBlackCard(card, players) {
    if (card[2])
        return card;
    const spots = (0, card_1.countRealizations)(setup_1.packs[card[0]].cards.black[card[1]]);
    const fills = [];
    for (let i = 0; i < spots; i++) {
        fills.push(players[(0, crypto_1.randomInt)(players.length)].toString());
    }
    return [card[0], card[1], fills];
}
exports.realizeBlackCard = realizeBlackCard;
const roundMap = {
    hand: (0, logic_1.next)(hand_1.handLogic, 'read'),
    read: read_1.readLogic
};
const roundLogic = (0, logic_1.sequence)(roundMap);
// -- game logic --
let gameLogic = (0, logic_1.or)((0, logic_1.loop)((0, logic_1.singleResolve)((0, logic_1.or)(game_1.joinLeaveLogic, roundLogic)), game_1.prepareRound), game_1.gameResultLogic); // first add/remove players, then further game logic
// -- global logic --
const globalMap = {
    setup: (0, logic_1.forward)(setup_1.setupLogic, 'game'),
    game: gameLogic,
};
const globalLogic = (0, logic_1.sequence)(globalMap);
exports.CAH = {
    name: "Crappy Ableist Humor",
    color: 0x000000,
    logic: globalLogic,
    initialContext() {
        return {
            state: 'setup',
            context: {},
        };
    },
};
