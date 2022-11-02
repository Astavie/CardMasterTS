import { MessageComponentInteraction } from "discord.js";

// A generic card supports two types of empty spots
// '_'  (a blank) gets replaced with some text defined by the game/user
// '{}' (a player spot) gets replaced by a random player's name

export function countBlanks(card: string) {
    return card.match(/\\_/gi)?.length || 1;
}

export function countRealizations(card: string) {
    return card.match(/{}/gi)?.length || 0;
}

export function shuffle<T>(a: T[]): T[] {
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

export function realizeCard(card: string, realizations: string[]) {
    const copy = [...realizations];
    return card.replaceAll(
        "{}",
        () => copy.shift()!
    );
}

export function fillBlanks(card: string, blanks: (string | null)[]) {
    if (!card.match(/\\_/gi)?.length) {
        return `${card}\n> ${bolden(blanks.map(s => s ?? '\\_').join(' '))}`;
    }

    const copy = [...blanks];
    return card.replaceAll("\\_", () => {
        let card = copy.shift();
        if (card === null || card === undefined) return "\\_";

        // rules to make the blank fit the sentence
        // final punctuation gets removed
        if (card.endsWith('.')) {
            card = card.substring(0, card.length - 1);
        }

        return bolden(card);
    });
}

export function bolden(s: string) {
    return s.length ? `**${s}**` : "";
}

export function escapeDiscord(s: string) {
    return s.replace(/[\\_*[\]<>()|~`]/g, '\\$&');
}

export function fillModal(prompt: string, i: MessageComponentInteraction, customId: string = "fill_modal") {
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
            if (index === -1 || index + 42 > split[i].length) index = split[i].length - 42;
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

