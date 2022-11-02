import { CommandInteraction, EmojiIdentifierResolvable, MessageActionRowOptions, MessageEmbedOptions } from 'discord.js'
import { MessageOptions } from '../util/message'
import { Game, Logic, Resolve, UserInteraction } from './logic'

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

type ToObject<T extends Arg> = { [P in T['name']]:
    T extends Flags       ? boolean[] :
    T extends MultiChoice ?  number[] :
    T extends Number      ?  number   : never
};

type ToObjectsArray<T extends readonly Arg[]> = {
  [I in keyof T]: ToObject<T[I]>
};

type UnionToIntersection<U> =
  (U extends any ? (k: U) => void : never) extends ((k: infer I) => void) ? I : never;

export type SetupContext<T extends readonly Arg[]> = UnionToIntersection<ToObjectsArray<T>[number]>;

export type SetupMessageGenerator<A extends readonly Arg[]> = (ctx: SetupContext<A>, game: Game) => MessageEmbedOptions;

function defaultMessageGenerator(_: unknown, game: Game): MessageEmbedOptions {
    return {
        fields: [{
            name: 'Players',
            value: game.players.map(p => p.toString()).join('\n') || '*None.*'
        }]
    };
}

export class SetupLogic<A extends readonly Arg[]> implements Logic<SetupContext<A>, Partial<SetupContext<A>>> {

    args: A;
    generator: SetupMessageGenerator<A>;

    constructor(args: A, generator: SetupMessageGenerator<A> = defaultMessageGenerator) {
        this.args = args;
        this.generator = generator;
    }

    _message(ctx: SetupContext<A>, game: Game): MessageOptions {
        const embeds = [this.generator(ctx, game)];
        const components: (Required<MessageActionRowOptions>)[] = [];
        
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
                arg.values.forEach((value, i) => row.components.push({
                    type: 'BUTTON',
                    customId: `_${arg.name}_${i}`,
                    label: value,
                    style: (ctx[arg.name] as boolean[])[i] ? 'SUCCESS' : 'SECONDARY',
                }));
                break;
            case 'choice':
                row.components = [{
                    type: 'SELECT_MENU',
                    customId: `_${arg.name}_`,
                    minValues: arg.min,
                    maxValues: Math.min(arg.values.length, arg.max),
                    placeholder: arg.name,
                    options: arg.values.map((value, i) => ({
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
            }],
        });

        return {
            embeds,
            components,
            forceList: false,
        };
    }

    onEnter(ctx: Partial<SetupContext<A>>, game: Game, _: Resolve<SetupContext<A>>, i?: CommandInteraction) {
        for (const arg of this.args) {
            if (!ctx[arg.name]) ctx[arg.name] = arg.default;
        }
        game.updateLobby(this._message(ctx as SetupContext<A>, game), i);
    }

    onInteraction(ctx: Partial<SetupContext<A>>, game: Game, resolve: Resolve<SetupContext<A>>, i: UserInteraction) {
        switch (i.customId) {
        case '_join':
            if (game.players.indexOf(i.user) !== -1) {
                i.reply({
                    content: 'You have already joined!',
                    ephemeral: true
                });
                return;
            }

            game.players.push(i.user);
            game.updateLobby(this._message(ctx as SetupContext<A>, game), i);
            return;
        case '_leave':
            const index = game.players.indexOf(i.user);
            if (index === -1) {
                i.reply({ content: 'You have not even joined!', ephemeral: true });
                return;
            }

            game.players.splice(index, 1);
            game.updateLobby(this._message(ctx as SetupContext<A>, game), i);
            return;
        case '_start':
            resolve(ctx as SetupContext<A>, i);
            return;
        }

        const arg = this.args.find(arg => i.customId.startsWith(`_${arg.name}_`));
        if (!arg) return;

        switch (arg.type) {
        case 'flags':
            const num = parseInt(i.customId.substring(arg.name.length + 2));
            const flags = ctx[arg.name] as boolean[];
            flags[num] = !flags[num];
            break;
        case 'number':
            const end = i.customId.substring(i.customId.length - 3);
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
            if (i.isSelectMenu()) (ctx[arg.name] as number[]) = i.values.map(value => parseInt(value));
            break;
        }
        
        game.updateLobby(this._message(ctx as SetupContext<A>, game), i);
    }

}

