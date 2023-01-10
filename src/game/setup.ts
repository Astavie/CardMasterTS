import { APIActionRowComponent, APIEmbed, APIMessageActionRowComponent, APIMessageComponentEmoji, ButtonInteraction, ButtonStyle, ComponentEmojiResolvable, ComponentType, Snowflake, StringSelectMenuInteraction, User } from 'discord.js'
import { Generator, Transformer, Game, Logic } from './logic'

export type Arg = Flags | MultiChoice | Number;

export type Flags = {
    type: 'flags',
    name: string,

    values:  readonly string[] | ((guild: Snowflake) => string[]),
}

export type MultiChoice = {
    type: 'choice',
    name: string,

    values:  readonly ChoiceOption[] | ((guild: Snowflake) => ChoiceOption[]),
    min: number,
    max: number,
}

export type ChoiceOption = {
    label: string;
    description?: string;
    emoji?: APIMessageComponentEmoji;
}

export type Number = {
    type: 'number',
    name: string,
    
    min: number,
    max: number,
    default: number,
}

export type SetupContext<T extends readonly Arg[]> = { [A in T[number] as A['name']]:
    A extends Flags       ? boolean[] :
    A extends MultiChoice ?  number[] :
    A extends Number      ?  number   : never
};

export type SetupMessageGenerator<A extends readonly Arg[]> = Generator<APIEmbed, SetupContext<A>>;

export type GameStarter<C, A extends readonly Arg[]> = Transformer<ButtonInteraction, C | null, SetupContext<A>>

function defaultMessageGenerator(_: Game, players: User[]): APIEmbed {
    return {
        fields: [{
            name: 'Players',
            value: players.map(p => p.toString()).join('\n') || '*None.*'
        }]
    };
}

export function setup<C extends NonNullable<unknown>, A extends readonly Arg[]>(
    args: A,
    starter: GameStarter<C, A>,
    message: SetupMessageGenerator<A> = defaultMessageGenerator,
): Logic<C | null, SetupContext<A>> {
    async function fullMessage(game: Game, players: User[], ctx: SetupContext<A>) {
        const embeds = [await message(game, players, ctx)];
        const components: APIActionRowComponent<APIMessageActionRowComponent>[] = [];

        for (const arg of args) {
            const row: APIActionRowComponent<APIMessageActionRowComponent> = {
                type: ComponentType.ActionRow,
                components: [{
                    type: ComponentType.Button,
                    custom_id: `_${arg.name}_`,
                    label: arg.name,
                    style: ButtonStyle.Primary,
                    disabled: true,
                }],
            }
            components.push(row);

            switch (arg.type) {
            case 'flags':
                let values = arg.values;
                if (typeof values === 'function') {
                    values = values(game.getGuild());
                }
                values.forEach((value, i) => row.components.push({
                    type: ComponentType.Button,
                    custom_id: `_${arg.name}_${i}`,
                    label: value,
                    style: (ctx[arg.name] as boolean[])[i] ? ButtonStyle.Success : ButtonStyle.Secondary,
                }));
                break;
            case 'choice':
                let values2 = arg.values;
                if (typeof values2 === 'function') {
                    values2 = values2(game.getGuild());
                }
                row.components = [{
                    type: ComponentType.StringSelect,
                    custom_id: `_${arg.name}_`,
                    min_values: arg.min,
                    max_values: Math.min(values2.length, arg.max),
                    placeholder: arg.name,
                    options: values2.map((value, i) => ({
                        default: (ctx[arg.name] as number[]).includes(i),
                        value: i.toString(),
                        ...value,
                    })),
                }];
                break;
            case 'number':
                row.components.push({
                    type: ComponentType.Button,
                    style: ButtonStyle.Primary,
                    label: '◀',
                    custom_id: `_${arg.name}_dec`,
                    disabled: (ctx[arg.name] as number) <= arg.min,
                },{
                    type: ComponentType.Button,
                    style: ButtonStyle.Secondary,
                    label: (ctx[arg.name] as number).toString(),
                    custom_id: `_${arg.name}_def`,
                },{
                    type: ComponentType.Button,
                    style: ButtonStyle.Primary,
                    label: '▶',
                    custom_id: `_${arg.name}_inc`,
                    disabled: (ctx[arg.name] as number) >= arg.max,
                })
                break;
            }
        }

        components.push({
            type: ComponentType.ActionRow,
            components: [{
                type: ComponentType.Button,
                custom_id: '_join',
                label: 'Join',
                style: ButtonStyle.Success,
            },{
                type: ComponentType.Button,
                custom_id: '_leave',
                label: 'Leave',
                style: ButtonStyle.Danger,
            },{
                type: ComponentType.Button,
                custom_id: '_start',
                label: 'Start',
                style: ButtonStyle.Primary,
            },{
                type: ComponentType.Button,
                custom_id: '_close',
                label: 'Close',
                style: ButtonStyle.Secondary,
            }],
        });

        return {
            embeds,
            components,
            forceList: false,
        };
    }
    return async (game, players, ctx, events) => {
        for await (const event of events) {
            switch (event.type) {
            case 'start':
                await game.updateLobby(await fullMessage(game, players, ctx), event.interaction);
                break;
            case 'interaction':
                switch (event.interaction.customId) {
                case '_close':
                    await game.closeLobby(undefined, event.interaction);
                    return null;
                case '_join':
                    if (await game.addPlayer(event.interaction.user)) {
                        await game.updateLobby(await fullMessage(game, players, ctx), event.interaction);
                    } else {
                        await event.interaction.reply({
                            content: 'You have already joined!',
                            ephemeral: true
                        });
                    }
                    break;
                case '_leave':
                    if (await game.removePlayer(event.interaction.user)) {
                        await game.updateLobby(await fullMessage(game, players, ctx), event.interaction);
                    } else {
                        await event.interaction.reply({ content: 'You have not even joined!', ephemeral: true });
                    }
                    break;
                case '_start':
                    const t = await starter(game, players, ctx, event.interaction as ButtonInteraction);
                    if (t !== null) return t;
                    break;
                }

                const arg = args.find(arg => event.interaction.customId.startsWith(`_${arg.name}_`));
                if (!arg) break;

                switch (arg.type) {
                case 'flags':
                    const num = parseInt(event.interaction.customId.substring(arg.name.length + 2));
                    const flags = ctx[arg.name] as boolean[];
                    flags[num] = !flags[num];
                    break;
                case 'number':
                    const end = event.interaction.customId.substring(event.interaction.customId.length - 3);
                    switch (end) {
                    case 'inc':
                        if (ctx[arg.name] < arg.max) (ctx[arg.name] as number) += 1;
                        break;
                    case 'dec':
                        if (ctx[arg.name] > arg.min) (ctx[arg.name] as number) -= 1;
                        break;
                    case 'def':
                        (ctx[arg.name] as number) = arg.default;
                        break;
                    }
                    break;
                case 'choice':
                    (ctx[arg.name] as number[]) = (event.interaction as StringSelectMenuInteraction).values.map(value => parseInt(value));
                    break;
                }
            
                await game.updateLobby(await fullMessage(game, players, ctx), event.interaction);
                break;
            }
        }
        return null;
    };
}
