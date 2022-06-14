import { BaseCommandInteraction, Interaction, Message, MessageComponentInteraction, MessageOptions, TextBasedChannel } from "discord.js";

export type MessageGenerator = (channel: TextBasedChannel, prev?: Message) => MessageOptions;

export type MessageConsumer = (message: Message) => any;

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

export class MessageController {

    message: MessageGenerator;
    consumers: MessageConsumer[] = [];

    messages: Message[] = [];

    constructor(message?: MessageGenerator) {
        this.message = message ?? (() => ({}));
    }

    async reply(i: BaseCommandInteraction | MessageComponentInteraction) {
        if (!i.channel) throw new Error("Unknown channel");

        const msg = await i.reply({ ... this.message(i.channel), fetchReply: true }) as Message;
        this.messages.push(msg);
        this.consumers.forEach(c => c(msg));
        return msg;
    }

    async send(channel: TextBasedChannel) {
        const msg = await channel.send(this.message(channel));
        this.messages.push(msg);
        this.consumers.forEach(c => c(msg));
        return msg;
    }

    update(i: MessageComponentInteraction) {
        if (!i.channel) throw new Error("Unknown channel");
        return i.update(this.message(i.channel, i.message as Message));
    }

    updateMessage(m: Message) {
        return m.edit(this.message(m.channel, m));
    }

    updateAll(i?: MessageComponentInteraction) {
        const promises: Promise<any>[] = [];

        for (const msg of this.messages) {
            const message = this.message(msg.channel, msg);

            if (i && i.message === msg) {
                promises.push(i.update(message));
            } else {
                promises.push(msg.edit(message));
            }
        }

        return Promise.all(promises);
    }

    end(i: MessageComponentInteraction) {
        const index = this.messages.indexOf(i.message as Message);
        if (index < 0) throw new Error("Message not found");

        const msg = this.messages.splice(index, 1)[0];
        return i.update(disableButtons(this.message(msg.channel, msg)));
    }

    endMessage(msg: Message) {
        const index = this.messages.indexOf(msg);
        if (index < 0) throw new Error("Message not found");

        this.messages.splice(index, 1)[0];
        return msg.edit(disableButtons(this.message(msg.channel, msg)));
    }

    endAll(i?: MessageComponentInteraction) {
        const promises: Promise<any>[] = [];

        for (const msg of this.messages) {
            const message = disableButtons(this.message(msg.channel, msg));

            if (i && i.message === msg) {
                promises.push(i.update(message));
            } else {
                promises.push(msg.edit(message));
            }
        }

        this.messages = [];

        return Promise.all(promises);
    }

    disableButtons(i: MessageComponentInteraction, ...exceptions: string[]) {
        if (!i.channel) throw new Error("Unknown channel");
        return i.update(disableButtons(this.message(i.channel, i.message as Message), ...exceptions));
    }

    isMyInteraction(i: MessageComponentInteraction) {
        return this.messages.includes(i.message as Message);
    }

}
