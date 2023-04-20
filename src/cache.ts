// Environment
import { config } from "dotenv";
config();

// Require the necessary discord.js classes
import { ChannelType, Client, GatewayIntentBits } from 'discord.js';
import { writeFileSync } from "fs";
import { shuffle } from "./util/card";

// Create a new client instance
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMessages] });

client.once('ready', async () => {

  const id: string = process.env.GUILD!;
  const guild = await client.guilds.fetch(id);
  const channels = await guild.channels.fetch();

  const messages: string[] = [];
  const promises: Promise<unknown>[] = [];

  channels.forEach(c => {
    if (c?.type !== ChannelType.GuildText) return;
    if (c.name.includes("mental")) return;
    if (c.name.includes("battles")) return;
    if (c.name.includes("botchannel")) return;
    if (c.name.includes("hurb")) return;

    promises.push((async () => {
      try {
        const channel = await c.fetch(true);

        let fetched = await channel.messages.fetch();

        fetched.forEach(m => {
          // ignore bot messages
          if (m.author.bot) return;
          messages.push(m.content);
        });
        
        while (fetched.size === 50) {
          fetched = await channel.messages.fetch({
            before: fetched.lastKey()!,
          });

          fetched.forEach(m => {
            // ignore bot messages
            if (m.author.bot) return;
            messages.push(m.content);
          });
        }
      } catch {
        console.log(c.name + " skipped");
      }
    })());
  });

  await Promise.all(promises);
  console.log(messages.length + " messages");

  shuffle(messages);
  writeFileSync("./messages.json", JSON.stringify(messages));
});

// Login to Discord with your client's token
client.login(process.env.TOKEN);
