import { Awaitable } from '@discordjs/builders';
import { ButtonInteraction, EmojiIdentifierResolvable, MessageActionRowOptions, MessageEmbedOptions, SelectMenuInteraction } from 'discord.js'
import { MessageOptions } from '../util/message'
import { Event, FullContext, Logic, Resolve } from './logic'

export type Arg = Flags | MultiChoice | Number;

export type Flags = {
    type: 'flags',
    name: string,

    values:  readonly string[],
    default: readonly boolean[],
}

export type MultiChoice = {
    type: 'choice',
    name: string,
    
    values:  readonly ChoiceOption[],
    default: readonly number[],
    min: number,
    max: number,
}

export type ChoiceOption = {
    label: string;
    description?: string;
    emoji?: EmojiIdentifierResolvable;
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

type Override<T extends readonly Arg[]> = { [A in T[number] as A['name']]?:
    A extends Flags       ? (full: FullContext<SetupContext<T>>) => string[] :
    A extends MultiChoice ? (full: FullContext<SetupContext<T>>) => ChoiceOption[] : never
};

export type SetupMessageGenerator<A extends readonly Arg[]> = (full: FullContext<SetupContext<A>>) => MessageEmbedOptions;

export type GameStarter<T, A extends readonly Arg[]> = (full: FullContext<SetupContext<A>>, i: ButtonInteraction) => Awaitable<T | null>

function defaultMessageGenerator({ players }: FullContext<unknown>): MessageEmbedOptions {
    return {
        fields: [{
            name: 'Players',
            value: players.map(p => p.toString()).join('\n') || '*None.*'
        }]
    };
}

export class SetupLogic<T, A extends readonly Arg[]> implements Logic<T | null, Partial<SetupContext<A>>> {

    args: A;
    override: Override<A>;
    generator: SetupMessageGenerator<A>;
    starter: GameStarter<T, A>;

    constructor(args: A, override: Override<A>, starter: GameStarter<T, A>, generator: SetupMessageGenerator<A> = defaultMessageGenerator) {
        this.args = args;
        this.override = override;
        this.generator = generator;
        this.starter = starter;
    }

    message(full: FullContext<SetupContext<A>>): MessageOptions {
        const embeds = [this.generator(full)];
        const components: (Required<MessageActionRowOptions>)[] = [];
        const ctx = full.ctx;

        for (const arg of this.args) {
            const row: Required<MessageActionRowOptions> = {
                type: 'ACTION_ROW',
                components: [{
                    type: 'BUTTON',
                    customId: `_${arg.name}_`,
                    label: arg.name,
                    style: 'PRIMARY',
                    disabled: true,
                }],
            }
            components.push(row);

            switch (arg.type) {
            case 'flags':
                let values: readonly string[] = arg.values;
                if (arg.name in this.override) {
                    values = this.override[arg.name](full);
                }
                values.forEach((value, i) => row.components.push({
                    type: 'BUTTON',
                    customId: `_${arg.name}_${i}`,
                    label: value,
                    style: (ctx[arg.name] as boolean[])[i] ? 'SUCCESS' : 'SECONDARY',
                }));
                break;
            case 'choice':
                let values2: readonly ChoiceOption[] = arg.values;
                if (arg.name in this.override) {
                    values2 = this.override[arg.name](full);
                }
                row.components = [{
                    type: 'SELECT_MENU',
                    customId: `_${arg.name}_`,
                    minValues: arg.min,
                    maxValues: Math.min(values2.length, arg.max),
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
                    type: 'BUTTON',
                    style: 'PRIMARY',
                    label: '◀',
                    customId: `_${arg.name}_dec`,
                    disabled: (ctx[arg.name] as number) <= arg.min,
                },{
                    type: 'BUTTON',
                    style: 'SECONDARY',
                    label: (ctx[arg.name] as number).toString(),
                    customId: `_${arg.name}_def`,
                },{
                    type: 'BUTTON',
                    style: 'PRIMARY',
                    label: '▶',
                    customId: `_${arg.name}_inc`,
                    disabled: (ctx[arg.name] as number) >= arg.max,
                })
                break;
            }
        }

        components.push({
            type: 'ACTION_ROW',
            components: [{
                type: 'BUTTON',
                customId: '_join',
                label: 'Join',
                style: 'SUCCESS',
            },{
                type: 'BUTTON',
                customId: '_leave',
                label: 'Leave',
                style: 'DANGER',
            },{
                type: 'BUTTON',
                customId: '_start',
                label: 'Start',
                style: 'PRIMARY',
            },{
                type: 'BUTTON',
                customId: '_close',
                label: 'Close',
                style: 'PRIMARY',
            }],
        });

        return {
            embeds,
            components,
            forceList: false,
        };
    }

    onEvent(_full: FullContext<Partial<SetupContext<A>>>, event: Event, resolve: Resolve<T | null>): void {
        const full = _full as unknown as FullContext<SetupContext<A>>;
        const { ctx, game } = full;

        switch (event.type) {
        case 'start':
            for (const arg of this.args) {
                if (!ctx[arg.name]) ctx[arg.name] = arg.default;
            }
            game.updateLobby(this.message(full), event.interaction);
            break;
        case 'interaction':
            switch (event.interaction.customId) {
            case '_close':
                game.closeLobby(undefined, event.interaction);
                resolve(null);
                return;
            case '_join':
                if (game.addPlayer(event.interaction.user)) {
                    game.updateLobby(this.message(full), event.interaction);
                } else {
                    event.interaction.reply({
                        content: 'You have already joined!',
                        ephemeral: true
                    });
                }
                return;
            case '_leave':
                if (game.removePlayer(event.interaction.user)) {
                    game.updateLobby(this.message(full), event.interaction);
                } else {
                    event.interaction.reply({ content: 'You have not even joined!', ephemeral: true });
                }
                return;
            case '_start':
                (async () => {
                    const t = await this.starter(full, event.interaction as ButtonInteraction);
                    if (t !== null) resolve(t);
                })();
                return;
            }

            const arg = this.args.find(arg => event.interaction.customId.startsWith(`_${arg.name}_`));
            if (!arg) return;

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
                (ctx[arg.name] as number[]) = (event.interaction as SelectMenuInteraction).values.map(value => parseInt(value));
                break;
            }
            
            game.updateLobby(this.message(full));
            break;
        }
    }

}

