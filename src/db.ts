import { Snowflake } from "discord.js"
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path"
import fetch from "node-fetch"
import { GameSave } from "./game/game"

export const db: {[key:string]:Save} = {};

export type Save = {
    path: string,
    packs: {[key:string]:string},
    games: GameSave<unknown>[],
}

export function createSave(guild: Snowflake): Save {
    const p = path.join(process.cwd(), "db", guild);
    return { path: p, packs: {}, games: [] };
}

export function saveGames(save: Save) {
    if (!existsSync(save.path)) {
        mkdirSync(save.path, { recursive: true });
    }
    writeFileSync(path.join(save.path, "packs.json"), JSON.stringify({ ... save.packs }));
    writeFileSync(path.join(save.path, "games.json"), JSON.stringify(save.games));
}

export async function loadPack(guild: Snowflake, pack: string): Promise<any> {
    const p = path.join(process.cwd(), "db", guild, "packs", pack + ".json");
    if (!existsSync(p)) {
        const url = db[guild].packs[pack];
        const res = await fetch(url)!;
        if (!res.body) {
            return;
        }
        const fileStream = createWriteStream(p);
        await new Promise((resolve, reject) => {
            res.body!.pipe(fileStream);
            res.body!.on("error", reject);
            fileStream.on("finish", resolve);
        });
    }
    return JSON.parse(readFileSync(p).toString());
}

export async function loadGames(save: Save) {
    const p = path.join(save.path, "games.json");
    if (existsSync(p)) {
        save.games = JSON.parse(readFileSync(p).toString())
    }
    const p2 = path.join(save.path, "packs.json");
    if (existsSync(p2)) {
        save.packs = JSON.parse(readFileSync(p2).toString())
    }
}
