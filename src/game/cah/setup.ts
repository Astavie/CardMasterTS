import { ButtonInteraction, Snowflake, User } from 'discord.js';
import { db, loadPack } from '../../db';
import { countBlanks, escapeDiscord, shuffle } from '../../util/card';
import { Game } from '../logic';
import { setup, SetupContext } from '../setup';
import { Card, GameContext, getBlackCard, getCard, getWhiteCard, Pack, randoId, realizeBlackCard, realizeWhiteCard, RoundContext, UnrealizedCard } from './cah';

function escapePack(p: Pack) {
    p.cards.white = p.cards.white.map(escapeDiscord);
    p.cards.black = p.cards.black.map(getCard).map(escapeDiscord);
    return p;
}

const config = [{
    type: 'choice',
    name: 'Packs',
    values: (guildid: Snowflake) => Object.keys(db[guildid]?.packs ?? {}).map(label => ({ label })),
    min: 1,
    max: Number.MAX_SAFE_INTEGER,
},{
    type: 'flags',
    name: 'Rules',
    values: ['Rando Cardrissian', 'Double or nothing', 'Quiplash mode'],
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
}] as const;

export const setupLogic = setup(config, startGame, (_, players, ctx) => {
    const splayers: string[] = players.map(player => player.toString());
    if (ctx['Rules'][0]) splayers.unshift('`Rando Cardrissian`');
    return { fields: [{
        name: 'Players',
        value: splayers.join('\n') || '*None.*',
    }]};
});

type CAHSetupContext = SetupContext<typeof config>;

export const defaultSetup: CAHSetupContext = {
    Packs: [],
    Rules: [true, true, false],
    "Max points": config[2].default,
    "Hand cards": config[3].default,
}

export const packs: {[key:string]:{[key:string]:Pack}} = {};

export async function getPack(guildid: Snowflake, pack: string): Promise<Pack> {
    packs[guildid] ??= {};
    packs[guildid][pack] ??= escapePack(await loadPack(guildid, pack));
    return packs[guildid][pack];
}

async function startGame(game: Game, players: User[], ctx: CAHSetupContext, i: ButtonInteraction): Promise<GameContext | null> {
    if (players.length < 2) {
        i.reply({
            content: 'You need at least two players to start.',
            ephemeral: true
        });
        return null;
    }

    const whiteDeck: UnrealizedCard[] = [];
    const blackDeck: UnrealizedCard[] = [];

    const guildid = game.getGuild();
    const names = Object.keys(db[guildid]?.packs ?? {});
    for (const pack of ctx['Packs']) {
        const p: Pack = await getPack(guildid, names[pack])
        for (let i = 0; i < p.cards.white.length; i++)
            whiteDeck.push([p.rawname, i]);
        for (let i = 0; i < p.cards.black.length; i++)
            blackDeck.push([p.rawname, i]);
    }

    shuffle(whiteDeck);
    shuffle(blackDeck);

    const blackCard = blackDeck.pop();
    if (!blackCard) {
        i.reply({
            content: 'The selected packs do not contain any black cards.',
            ephemeral: true
        });
        return null;
    }

    const prompt = await realizeBlackCard(guildid, blackCard, players);
    const blanks = countBlanks(await getBlackCard(guildid, prompt));

    let totalCards = ctx['Hand cards'] * players.length;
    if (ctx['Rules'][0]) totalCards += blanks;

    if (whiteDeck.length < totalCards) {
        await i.reply({
            content: 'There are not enough white cards in the selected packs to start the game.',
            ephemeral: true
        });
        return null;
    }

    // LET'S GO
    await game.closeLobby(undefined, i, ['_join', '_leave', '_close']);
    await game.allowSpectators();

    // rando's cards
    const points = Object.fromEntries(players.map(player => [player.id, 0]))
    let randoPlaying: Card[] | null = null;
    if (ctx['Rules'][0]) {
        points[randoId] = 0;
        randoPlaying = [];
        while (randoPlaying.length < blanks) {
            const card = whiteDeck.pop()!;
            randoPlaying.push(await realizeWhiteCard(guildid, card, players));
        }
    }

    let round: RoundContext;
    if (ctx['Rules'][2]) {
        const playing: {[key:string]:string[]|null} = Object.fromEntries(players.map(player => [player.id, null]));
        delete playing[players[0].id];
        if (randoPlaying) {
            playing[randoId] = await Promise.all(randoPlaying.map(c => getWhiteCard(guildid, c)));
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
    } else {
        const hand: {[key:string]:Card[]} = {}
        for (const player of players) {
            const phand: Card[] = [];
            hand[player.id] = phand;

            while (phand.length < ctx['Hand cards']) {
                const card = whiteDeck.pop()!;
                phand.push(await realizeWhiteCard(guildid, card, players));
            }
        }
        const playing = Object.fromEntries(players.map(player => [player.id, Array(blanks).fill(null)]));
        delete playing[players[0].id];
        if (randoPlaying) {
            hand[randoId] = randoPlaying;
            playing[randoId] = [...Array(blanks).keys()];
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
        idx: 0,
        ctx: round,
    };
}
