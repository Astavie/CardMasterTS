import { BaseCommandInteraction, Client, EmbedFieldData, Message, MessageActionRowOptions, MessageComponentInteraction, MessageEmbedOptions, ModalSubmitInteraction, Snowflake, TextBasedChannel } from "discord.js";

export type MessageOptions = {
    content?: string;
    embeds?: MessageEmbedOptions[];
    components?: (Required<MessageActionRowOptions>)[];
}

export type MessageGenerator = (channel: TextBasedChannel, prev?: Message) => MessageOptions;

export type MessageConsumer = (message: Message) => any;

export type MessageSender = (msg: MessageOptions) => Promise<Message>;

// there are up to:
// - 6000 characters for all embeds
// - 25 fields per embed
// - 1024 characters per field

const fieldLimit = 1024;
const embedLimit = 2048; // lower threshold since 6000 characters are still too much
const embedFieldLimit = 25;

function prepareMessage(msg: MessageOptions, page: number = 0, forceList: boolean = false, transformer: (o: MessageOptions) => MessageOptions = o => o): [MessageOptions, MessageOptions[] | null] {
    if (!msg.embeds) return [msg, null];

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
                // Get as many lines under the 1024 limit
                const split = field.value.split("\n");
                let first = split.shift() as string;
                while (split.length && first.length + split[0].length + 1 <= fieldLimit) {
                    first += "\n" + split.shift();
                }

                // Create first field
                field.value = first;
                fields.push(field);

                // Continue
                field = { name: ".", value: split.join("\n") };
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
                ("\nPage 99/99".length)

            while (fields.length && first.length + 1 <= embedFieldLimit && chars + fields[0].name.length + fields[0].value.length <= embedLimit) {
                chars += fields[0].name.length + fields[0].value.length;
                first.push(fields.shift() as EmbedFieldData);
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
            embed.footer.text ??= "";
            embed.footer.text += `\nPage ${i + 1}/${embeds.length}`;
        }
    }

    const addButtons = (cur: MessageOptions, i: number) => {
        // Add next page and prev page buttons
        cur.components = cur.components?.length ? [ ...cur.components ] : [{
            type: "ACTION_ROW",
            components: [],
        }];
        const row = { ...cur.components[cur.components.length - 1] };
        cur.components[cur.components.length - 1] = row;

        row.components = [
            ...row.components,
            {
                type: "BUTTON",
                style: "PRIMARY",
                label: "◀",
                customId: `_prevpage`,
                disabled: i === 0,
            }, {
                type: "BUTTON",
                style: "PRIMARY",
                label: "▶",
                customId: `_nextpage`,
                disabled: i + 1 >= embeds.length,
            }
        ];
        return cur;
    }

    // Create list of MessageOptions
    let list: MessageOptions[] | null = null;
    if (embeds.length > 1 || forceList) {
        list = [];
        for (let i = 0; i < embeds.length; i++) {
            const cur = { ...msg, embeds: [embeds[i]] };
            list.push(transformer(addButtons(cur, i)));
        }
    }

    // Get return value
    let ret: MessageOptions = { ...msg };
    if (page >= embeds.length) {
        ret.embeds = [{ footer: { text: `Page ${page + 1}/${embeds.length}` } }];
        addButtons(ret, page);
        ret = transformer(ret);
    } else if (list) {
        ret = list[page];
    } else {
        ret.embeds = [embeds[page]];
        ret = transformer(ret);
    }

    return [ret, list];
}

function disableButtons(m: MessageOptions, ...exceptions: string[]): MessageOptions {
    if (!m.components) return m;
    for (const row of m.components) {
        for (const comp of row.components) {
            if (!(comp as any).customId || !exceptions.includes((comp as any).customId)) {
                comp.disabled = true;
            }
        }
    }
    return m;
}

export type MessageSave = {
    forceList: boolean,
    disableButtons?: string[],

    messages: {[key: Snowflake]: Snowflake};
    pages: {[key: Snowflake]: number};
}

export class MessageController {

    message: MessageGenerator;
    forceList: boolean = false;
    disableButtons?: string[];

    messages: {[key: Snowflake]: Message} = {};
    pages: {[key: Snowflake]: {
        page: number,
        pages?: MessageOptions[],
    }} = {};

    constructor(message: MessageGenerator = (() => ({})), forceList: boolean = false) {
        this.message = message;
        this.forceList = forceList;
    }

    save(): MessageSave {
        return {
            forceList: this.forceList,
            disableButtons: this.disableButtons,
            messages: Object.fromEntries(Object.entries(this.messages).map(([k, v]) => [k, v.id])),
            pages: Object.fromEntries(Object.entries(this.pages).filter(([k, v]) => v.page > 0).map(([k, v]) => [k, v.page])),
        };
    }

    load(client: Client, save: MessageSave) {
        this.forceList = save.forceList;
        this.disableButtons = save.disableButtons;
        this.pages = Object.fromEntries(Object.entries(save.pages).map(([k, v]) => [k, { page: v }]));

        const promises: Promise<any>[] = [];

        for (const [k, v] of Object.entries(save.messages)) {
            promises.push(client.channels.fetch(k).then(c => {
                if (!c?.isText()) return;
                return c.messages.fetch(v).then(m => {
                    this.messages[k] = m;
                });
            }));
        }

        return Promise.all(promises);
    }

    async sendMessage(channel: TextBasedChannel, sender: MessageSender, prev?: Message, disableAllButtons = false) {
        const page = prev ? this.pages[prev.channel.id]?.page ?? 0 : 0;

        let transformer = this.disableButtons ? (o: MessageOptions) => disableButtons(o, ...this.disableButtons!) : undefined;
        if (disableAllButtons) transformer = disableButtons;

        const [cur, pages] = prepareMessage(this.message(channel, prev), page, this.forceList, transformer);
        
        const msg = await sender(cur);

        if (!prev) {
            this.messages[msg.channel.id] = msg;
        }

        if (pages) {
            this.pages[msg.channel.id] = { page, pages };
        }

        return msg;
    }

    reply(i: BaseCommandInteraction | MessageComponentInteraction | ModalSubmitInteraction) {
        if (!i.channel) throw new Error("Unknown channel");
        return this.sendMessage(i.channel, (o => i.reply({ ...o, fetchReply: true })) as MessageSender);
    }

    send(channel: TextBasedChannel) {
        return this.sendMessage(channel, (o => channel.send(o)));
    }

    update(i: MessageComponentInteraction | ModalSubmitInteraction) {
        if (!i.channel || !i.message) throw new Error("Unknown message");
        return this.sendMessage(i.channel, (o => i.update({ ...o, fetchReply: true })) as MessageSender, i.message as Message);
    }

    updateMessage(m: Message) {
        return this.sendMessage(m.channel, (o => m.edit(o)), m);
    }

    updateAll(i?: MessageComponentInteraction | ModalSubmitInteraction) {
        const promises: Promise<any>[] = [];

        for (const msg of Object.values(this.messages)) {
            if (i && i.message === msg) {
                promises.push(this.sendMessage(msg.channel, (o => i.update({ ...o, fetchReply: true })) as MessageSender, msg));
            } else {
                promises.push(this.sendMessage(msg.channel, (o => msg.edit(o)), msg));
            }
        }

        return Promise.all(promises);
    }

    end(i: MessageComponentInteraction | ModalSubmitInteraction) {
        if (!i.channel || !i.message) throw new Error("Unknown message");
        delete this.messages[i.channel.id];
        delete this.pages[i.channel.id];
        return this.sendMessage(i.channel, (o => i.update({ ...o, fetchReply: true })) as MessageSender, i.message as Message, true);
    }

    endMessage(msg: Message) {
        delete this.messages[msg.channel.id];
        delete this.pages[msg.channel.id];
        return this.sendMessage(msg.channel, (o => msg.edit(o)), msg, true);
    }

    endAll(i?: MessageComponentInteraction | ModalSubmitInteraction) {
        const promises: Promise<any>[] = [];

        for (const msg of Object.values(this.messages)) {
            if (i && i.message === msg) {
                promises.push(this.sendMessage(msg.channel, (o => i.update({ ...o, fetchReply: true })) as MessageSender, msg, true));
            } else {
                promises.push(this.sendMessage(msg.channel, (o => msg.edit(o)), msg, true));
            }
        }

        this.messages = {};
        this.pages = {};

        return Promise.all(promises);
    }

    isMyInteraction(i: MessageComponentInteraction | ModalSubmitInteraction) {
        if (!i.channel || !i.message) throw new Error("Unknown message");
        return this.messages[i.channel.id]?.id === i.message.id;
    }

}
