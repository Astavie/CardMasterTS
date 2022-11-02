import { BaseCommandInteraction, ButtonInteraction, Client, EmbedFieldData, Message, MessageActionRowComponentResolvable, MessageActionRowOptions, MessageButtonOptions, MessageComponentInteraction, MessageEmbedOptions, ModalSubmitInteraction, Snowflake, TextBasedChannel } from "discord.js"
import { Serializable } from "./saving";

export type MessageOptions = {
    embeds: MessageEmbedOptions[];
    components: (Required<MessageActionRowOptions>)[];
    forceList: boolean;
}

export function createButtonGrid(length: number, generator: (i: number) => MessageButtonOptions): (Required<MessageActionRowOptions>)[] {
    const rows: (Required<MessageActionRowOptions>)[] = [];
    let i = 0;
    while (i < length) {
        const row: MessageActionRowComponentResolvable[] = [];
        for (let j = 0; j < 5; j++) {
            row.push({
                type: 'BUTTON',
                ...generator(i),
            });
            i++;
            if (i >= length) break;
        }
        rows.push({
            type: 'ACTION_ROW',
            components: row,
        });
    }
    return rows;
}

export function disableButtons(m: (Required<MessageActionRowOptions>)[], exceptions?: string[]): (Required<MessageActionRowOptions>)[] {
    const newRows: (Required<MessageActionRowOptions>)[] = [];

    for (const row of m) {
        const newRow: MessageActionRowComponentResolvable[] = [];

        for (const comp of row.components) {
            if (!comp.disabled && (!exceptions || !exceptions.includes((comp as any).customId))) {
                newRow.push({ ...comp, disabled: true } as MessageActionRowComponentResolvable);
            } else {
                newRow.push(comp);
            }
        }

        newRows.push({
            type: 'ACTION_ROW',
            components: newRow,
        });
    }
    return newRows;
}

// there are up to:
// - 6000 characters for all embeds
// - 25 fields per embed
// - 1024 characters per field

const fieldLimit = 1024;
const embedLimit = 2048; // lower threshold since 6000 characters are still too much
const embedFieldLimit = 25;

function prepareMessage(msg: MessageOptions): MessageEmbedOptions[] {
    const embeds: MessageEmbedOptions[] = [];

    for (const embed of msg.embeds) {

        if (!embed.fields) {
            embeds.push(embed);
            continue;
        }

        // split up large fields
        const fields: EmbedFieldData[] = [];

        for (let field of embed.fields) {
            while (field.value.length > fieldLimit) {
                // Split field on newline
                let split = field.value.lastIndexOf('\n', fieldLimit);
                if (split === -1) {
                    split = field.value.lastIndexOf(' ', fieldLimit);
                    if (split === -1) {
                        split = fieldLimit;
                    }
                }

                const fst = field.value.substring(0, split);
                const snd = field.value.substring(split).trimStart();

                // Create intermediary field
                field.value = fst;
                fields.push(field);

                // Continue
                field = { name: ".", value: snd };
            }

            // Push last field
            fields.push(field);
        }

        // put as many fields in the embed as possible
        while (fields.length) {
            const first: EmbedFieldData[] = [];
            let chars = 
                (embed.title?.length ?? 0) +
                (embed.description?.length ?? 0) +
                (embed.footer?.text?.length ?? 0) +
                (embed.author?.name?.length ?? 0) +
                ('\nPage 99/99'.length);

            while (
                fields.length &&
                first.length + 1 <= embedFieldLimit &&
                chars + fields[0].name.length + fields[0].value.length <= embedLimit
            ) {
                chars += fields[0].name.length + fields[0].value.length;
                first.push(fields.shift()!);
            }

            embeds.push({
                ...embed,
                fields: first,
            });
        }
    }

    // Add page count to footer
    if (embeds.length > 1) {
        for (let i = 0; i < embeds.length; i++) {
            const embed = embeds[i];
            embed.footer ??= {};
            embed.footer.text ??= '';
            embed.footer.text += `\nPage ${i + 1}/${embeds.length}`;
        }
    }

    return embeds;
}

function addPageButtons(components: (Required<MessageActionRowOptions>)[], page: number, max: number): (Required<MessageActionRowOptions>)[] {
    components = components.length ? [ ...components ] : [{
        type: "ACTION_ROW",
        components: [],
    }];
    const row = { ...components[components.length - 1] };
    components[components.length - 1] = row;

    row.components.push({
        type: "BUTTON",
        style: "PRIMARY",
        label: "◀",
        customId: `_prevpage`,
        disabled: page === 0,
    }, {
        type: "BUTTON",
        style: "PRIMARY",
        label: "▶",
        customId: `_nextpage`,
        disabled: page + 1 >= max,
    });

    return components;
}

export type MessageSave = {[key: Snowflake]: {
    msg: Snowflake,
    cache?: MessageEmbedOptions[],
    page?: number,
}};

export class MessageController implements Serializable<MessageSave> {
    
    messages: {[key: Snowflake]: {
        msg: Message,
        cache?: MessageEmbedOptions[],
        page?: number,
    }} = {};

    async send(channel: TextBasedChannel, options: MessageOptions, i?: BaseCommandInteraction | MessageComponentInteraction | ModalSubmitInteraction) {
        const previous = this.messages[channel.id];
        let page = previous?.page ?? 0;

        const cache = prepareMessage(options);
        if (page >= cache.length) page = cache.length - 1;

        const prepared = {
            embeds: [cache[page]],
            components: cache.length > 1 || options.forceList
                ? addPageButtons(options.components, page, cache.length)
                : options.components,
        };

        let msg: Message;

        if (i) {
            if (i.isCommand()) {
                msg = await i.reply({ ...prepared, fetchReply: true }) as Message;
            } else {
                msg = await (i as MessageComponentInteraction | ModalSubmitInteraction).update({ ...prepared, fetchReply: true }) as Message;
            }
        } else {
            if (previous) {
                msg = await previous.msg.edit(prepared);
            } else {
                msg = await channel.send(prepared);
            }
        }

        this.messages[channel.id] = {
            msg,
            cache: cache.length > 1 ? cache : undefined,
            page:          page > 0 ? page  : undefined,
        }
    }

    async flipPage(i: ButtonInteraction) {
        const previous = this.messages[i.channel!.id];
        let page = previous.page ?? 0;
        let cache = previous.cache;

        if (!cache) {
            return;
        }

        switch (i.customId) {
            case '_prevpage':
                if (page > 0) page -= 1;
                break;
            case '_nextpage':
                page += 1;
                break;
        }
        if (page >= cache.length) page = cache.length - 1;

        const prepared = {
            embeds: [cache[page]],
            components: addPageButtons(previous.msg.components, page, cache.length),
        };

        const msg = await i.update({ ...prepared, fetchReply: true }) as Message;

        this.messages[msg.channel.id] = {
            msg,
            page,
            cache,
        }
    }

    save(): MessageSave {
        return Object.fromEntries(
            Object.entries(this.messages)
                .map(([k, v]) => [k, { msg: v.msg.id, cache: v.cache, page: v.page }])
        );
    }

    async load(client: Client, save: MessageSave) {
        const promises: Promise<void>[] = [];

        for (const [k, v] of Object.entries(save)) {
            promises.push(client.channels.fetch(k).then(async c => {
                if (!c?.isText()) throw new Error();
                await c.messages.fetch(v.msg).then(m => {
                    this.messages[k] = { msg: m, page: v.page, cache: v.cache };
                });
            }));
        }

        await Promise.all(promises);
    }

    isMyInteraction(i: MessageComponentInteraction | ModalSubmitInteraction) {
        return this.messages[i.channel!.id]?.msg.id === i.message?.id;
    }

}

