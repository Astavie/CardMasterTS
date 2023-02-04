import { ButtonInteraction, Snowflake, User } from 'discord.js';
import { db } from '../../db';
import { shuffle } from '../../util/card';
import { Game, Pack } from '../logic';
import { setup, SetupContext } from '../setup';
import { Card, countBlanks, GameContext, getBlackCard, getWhiteCard, randoId, realizeBlackCard, realizeWhiteCard, RoundContext, UnrealizedCard } from './cah';

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

function startGame(game: Game, players: User[], ctx: CAHSetupContext, i: ButtonInteraction): GameContext | null {
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
    const rawnames: string[] = [];
    for (const pack of ctx['Packs']) {
        const p: Pack = game.getPack(names[pack])!
        rawnames.push(p.rawname);
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

    const prompt = realizeBlackCard(game, blackCard, players);
    const blanks = countBlanks(game, blackCard);

    let totalCards = ctx['Hand cards'] * players.length;
    if (ctx['Rules'][0]) totalCards += blanks;

    if (whiteDeck.length < totalCards) {
        i.reply({
            content: 'There are not enough white cards in the selected packs to start the game.',
            ephemeral: true
        });
        return null;
    }

    // LET'S GO
    game.closeLobby(undefined, i, ['_join', '_leave', '_close']);
    game.allowSpectators();

    // rando's cards
    const points = Object.fromEntries(players.map(player => [player.id, 0]))
    let randoPlaying: Card[] | null = null;
    if (ctx['Rules'][0]) {
        points[randoId] = 0;
        randoPlaying = [];
        while (randoPlaying.length < blanks) {
            const card = whiteDeck.pop()!;
            randoPlaying.push(realizeWhiteCard(game, card, players));
        }
    }

    let round: RoundContext;
    if (ctx['Rules'][2]) {
        const playing: {[key:string]:string[]|null} = Object.fromEntries(players.map(player => [player.id, null]));
        delete playing[players[0].id];
        if (randoPlaying) {
            playing[randoId] = randoPlaying.map(c => getWhiteCard(game, c));
        }
        round = {
            packs: rawnames,
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
                phand.push(realizeWhiteCard(game, card, players));
            }
        }
        const playing = Object.fromEntries(players.map(player => [player.id, Array(blanks).fill(null)]));
        delete playing[players[0].id];
        if (randoPlaying) {
            hand[randoId] = randoPlaying;
            playing[randoId] = [...Array(blanks).keys()];
        }
        round = {
            packs: rawnames,
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
