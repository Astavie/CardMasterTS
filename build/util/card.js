"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fillModal = exports.escapeDiscord = exports.bolden = exports.fillBlanks = exports.realizeCard = exports.shuffle = exports.countRealizations = exports.countBlanks = void 0;
// A generic card supports two types of empty spots
// '_'  (a blank) gets replaced with some text defined by the game/user
// '{}' (a player spot) gets replaced by a random player's name
function countBlanks(card) {
    return card.match(/\\_/gi)?.length || 1;
}
exports.countBlanks = countBlanks;
function countRealizations(card) {
    return card.match(/{}/gi)?.length || 0;
}
exports.countRealizations = countRealizations;
function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}
exports.shuffle = shuffle;
function realizeCard(card, realizations) {
    const copy = [...realizations];
    return card.replaceAll("{}", () => copy.shift());
}
exports.realizeCard = realizeCard;
function fillBlanks(card, blanks) {
    const n = card.match(/\\_/gi)?.length;
    if (!n) {
        return `${card}\n> ${bolden(blanks.map(s => s ?? '\\_').join(' '))}`;
    }
    const copy = [...blanks];
    if (copy.length > n) {
        copy.push(copy.splice(n - 1, copy.length).join(' '));
    }
    return card.replaceAll("\\_", () => {
        let card = copy.shift();
        if (card === null || card === undefined)
            return "\\_";
        // rules to make the blank fit the sentence
        // final punctuation gets removed
        if (card.endsWith('.')) {
            card = card.substring(0, card.length - 1);
        }
        return bolden(card);
    });
}
exports.fillBlanks = fillBlanks;
function bolden(s) {
    return s.length ? `**${s}**` : "";
}
exports.bolden = bolden;
function escapeDiscord(s) {
    return s.replace(/[\\_*[\]<>()|~`]/g, '\\$&');
}
exports.escapeDiscord = escapeDiscord;
function fillModal(prompt, i, customId = "fill_modal") {
    const split = prompt.replace(/\\(.)/g, "$1").split('_'); // remove escaping backslashes
    for (let i = 0; i < split.length - 1; i++) {
        split[i] += "_";
    }
    if (split.length > 1) {
        const second = split.length - 2;
        const last = split.length - 1;
        split[second] += split.splice(last, 1)[0];
    }
    for (let i = 0; i < split.length; i++) {
        if (split[i].length > 45) {
            const prevLength = split[i].length;
            let index = split[i].indexOf('_');
            if (index === -1 || index + 42 > split[i].length)
                index = split[i].length - 42;
            split[i] = split[i].substring(index, index + 42);
            if (index > 0) {
                split[i] = "..." + split[i];
            }
            if (index + 42 < prevLength) {
                split[i] = split[i].substring(0, 42);
                split[i] = split[i] + "...";
            }
        }
    }
    i.showModal({
        customId,
        title: "Fill in the blanks",
        components: split.map((s, i) => ({
            type: "ACTION_ROW",
            components: [{
                    type: "TEXT_INPUT",
                    customId: `blank_${i}`,
                    style: "SHORT",
                    label: s
                }]
        }))
    });
}
exports.fillModal = fillModal;
