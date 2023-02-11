import { ComponentType, MessageComponentInteraction, TextInputStyle } from "discord.js";

// A generic card supports two types of empty spots
// '_'  (a blank) gets replaced with some text defined by the game/user
// '{}' (a player spot) gets replaced by a random player's name

export function countBlanks2(card: string) {
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

export function fillBlanks(card: string, holes: number, blanks: string[], loop = false): string {
    const startn = card.match(/\\_/gi)?.length ?? 0;
    let extra = holes - startn;
    if (extra < 0) extra = 0;

    while (true) {
        let copy = [...blanks];
        while (copy.length) {
            let first = copy.shift()!.replaceAll('\\_', '**\\_**');
            if (!card.includes('\\_')) {
                extra -= 1;

                // append extra cards here if this is the last blank
                const lastBlank = extra === 0;
                if (lastBlank) {
                    let recursive = first.includes('\\_');
                    while (!recursive && copy.length) {
                        first = `${first} ${copy.shift()!.replaceAll('\\_', '**\\_**')}`
                        recursive = first.includes('\\_');
                    }
                }

                card = `${card}\n> ${bolden(first)}`;
            } else {
                // rules to make the blank fit the sentence
                // final punctuation gets removed
                if (first.endsWith('.')) {
                    first = first.substring(0, first.length - 1);
                }

                // append extra cards here if this is the last blank
                const lastBlank = extra === 0 && !card.replace('\\_', '').includes('\\_');
                if (lastBlank) {
                    let recursive = first.includes('\\_');
                    while (!recursive && copy.length) {
                        first = `${first} ${copy.shift()!.replaceAll('\\_', '**\\_**')}`
                        recursive = first.includes('\\_');
                    }
                }

                card = card.replace('\\_', bolden(first));
            }
        }

        // loop until every blank is filled if that is specified
        if (extra === 0 || !loop) {
            break;
        }
    }

    card = card.replaceAll('****', '');

    // append extra unused blanks
    for (let i = 0; i < extra; i++) {
        card = `${card}\n> \\_`;
    }

    return card;
}

export function bolden(s: string) {
    return s.length ? `**${s}**` : "";
}

export function escapeDiscord(s: string) {
    return s.replace(/[\\_*[\]<>()|~`]/g, '\\$&');
}

export async function fillModal(prompt: string, i: MessageComponentInteraction, customId: string = "fill_modal") {
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

    await i.showModal({
        customId,
        title: "Fill in the blanks",
        components: split.map((s, i) => ({
            type: ComponentType.ActionRow,
            components: [{
                type: ComponentType.TextInput,
                customId: `blank_${i}`,
                style: TextInputStyle.Short,
                label: s
            }]
        }))
    });
}

