import { countBlanks, escapeDiscord, shuffle } from '../../util/card';
import { Game, ReturnOf, UserInteraction } from '../logic';
import { SetupLogic } from '../setup';
import { Card, GameContext, getBlackCard, getWhiteCard, Pack, randoId, realizeBlackCard, realizeWhiteCard, RoundContext, UnrealizedCard } from './cah';
import { basePack, fullPack } from './packs/cahstandard';

// Global packs
export const packs: Pack[] = [
    escapePack({ name: "CAH Base", cards: basePack }),
    escapePack({ name: "CAH Full", cards: fullPack }),
];

// Packs inside .gitignore
function conditionalRequire(name: string): any {
    try {
        return require(name);
    } catch {}
    return undefined;
}

const eppgroep = conditionalRequire("./packs/eppgroep")?.eppgroep;

if (eppgroep) {
    const epack = escapePack({
        name: "EPPGroep",
        cards: eppgroep,
    });
    packs.push(epack);
    packs.push(epack);
}

function escapePack(p: Pack) {
    p.cards.white = p.cards.white.map(escapeDiscord);
    p.cards.black = p.cards.black.map(escapeDiscord);
    return p;
}

export const setupLogic = new SetupLogic([{
    type: 'choice',
    name: 'Packs',
    values: packs.map(pack => ({ label: pack.name })),
    default: [0],
    min: 1,
    max: Number.MAX_SAFE_INTEGER,
},{
    type: 'flags',
    name: 'Rules',
    values: ['Rando Cardrissian', 'Quiplash Mode'],
    default: [true, false],
},{
    type: 'number',
    name: 'Max points',
    min: 1,
    max: Number.MAX_SAFE_INTEGER,
    default: 9,
},{
    type: 'number',
    name: 'Hand cards',
    min: 1,
    max: 20,
    default: 10,
}] as const, (ctx, game) => {
    const players: string[] = game.players.map(player => player.toString());
    if (ctx['Rules'][0]) players.unshift('`Rando Cardrissian`');
    return { fields: [{
        name: 'Players',
        value: players.join('\n') || '*None.*',
    }]};
});

export type SetupContext = ReturnOf<typeof setupLogic>;

export async function startGame(_: unknown, game: Game, setup: SetupContext, i?: UserInteraction): Promise<GameContext | null> {
    if (game.players.length < 2) {
        i!.reply({
            content: 'You need at least two players to start.',
            ephemeral: true
        });
        return null;
    }

    const whiteDeck: UnrealizedCard[] = [];
    const blackDeck: UnrealizedCard[] = [];

    for (const pack of setup['Packs']) {
        for (let i = 0; i < packs[pack].cards.white.length; i++)
            whiteDeck.push([pack, i]);
        for (let i = 0; i < packs[pack].cards.black.length; i++)
            blackDeck.push([pack, i]);
    }

    shuffle(whiteDeck);
    shuffle(blackDeck);

    const blackCard = blackDeck.pop();
    if (!blackCard) {
        i!.reply({
            content: 'The selected packs do not contain any black cards.',
            ephemeral: true
        });
        return null;
    }

    const prompt = realizeBlackCard(blackCard, game.players);
    const blanks = countBlanks(getBlackCard(prompt));

    let totalCards = setup['Hand cards'] * game.players.length;
    if (setup['Rules'][0]) totalCards += blanks;

    if (whiteDeck.length < totalCards) {
        i!.reply({
            content: 'There are not enough white cards in the selected packs to start the game.',
            ephemeral: true
        });
        return null;
    }

    // LET'S GO
    game.closeLobby(i, ['_join', '_leave']);
    await game.allowSpectators();

    // rando's cards
    const points = Object.fromEntries(game.players.map(player => [player.id, 0]))
    let randoPlaying: Card[] | null = null;
    if (setup['Rules'][0]) {
        points[randoId] = 0;
        randoPlaying = [];
        while (randoPlaying.length < blanks) {
            const card = whiteDeck.pop()!;
            randoPlaying.push(realizeWhiteCard(card, game.players));
        }
    }

    let ctx: RoundContext;
    if (setup['Rules'][1]) {
        const playing: {[key:string]:string[]|null} = Object.fromEntries(game.players.map(player => [player.id, null]));
        delete playing[game.players[0].id];
        if (randoPlaying) {
            playing[randoId] = randoPlaying.map(getWhiteCard);
        }
        ctx = {
            quiplash: true,
            maxPoints: setup['Max points'],
            czar: 0,
            points,
            playing,
            whiteDeck,
            blackDeck,
            prompt,
            shuffle: [],
        };
    } else {
        const hand: {[key:string]:Card[]} = {}
        for (const player of game.players) {
            const phand: Card[] = [];
            hand[player.id] = phand;

            while (phand.length < setup['Hand cards']) {
                const card = whiteDeck.pop()!;
                phand.push(realizeWhiteCard(card, game.players));
            }
        }
        const playing = Object.fromEntries(game.players.map(player => [player.id, Array(blanks).fill(null)]));
        delete playing[game.players[0].id];
        if (randoPlaying) {
            hand[randoId] = randoPlaying;
            playing[randoId] = [...Array(blanks).keys()];
        }
        ctx = {
            quiplash: false,
            handCards: setup['Hand cards'],
            maxPoints: setup['Max points'],
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
        context: ctx,
    };
}

