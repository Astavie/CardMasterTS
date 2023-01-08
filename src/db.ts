import { Snowflake } from "discord.js"
import { createWriteStream, existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "fs";
import path from "path"
import fetch from "node-fetch"
import { GameSave } from "./game/game"

export const db: {[key:string]:Save} = {};

export type Save = {
    path: string,
    packs: {[key:string]:string},
    games: GameSave<unknown>[],
}

function base64(i: number): string {
    return Buffer.from([i>>24, i>>16, i>>8, i]).toString('base64').substring(0, 6).replaceAll('/', '_');
}

function getFolder(guild: Snowflake): string {
    return path.join(process.cwd(), "..", "db", guild);
}

export function createSave(guild: Snowflake): Save {
    return { path: getFolder(guild), packs: {}, games: [] };
}

export function saveGames(save: Save) {
    if (!existsSync(save.path)) {
        mkdirSync(save.path, { recursive: true });
    }
    writeFileSync(path.join(save.path, "packs.json"), JSON.stringify({ ... save.packs }));
    writeFileSync(path.join(save.path, "games.json"), JSON.stringify(save.games));
}

export function refreshPack(guild: Snowflake, pack: string) {
    const p = path.join(getFolder(guild), "packs", pack + ".json");
    if (existsSync(p)) rmSync(p);
}

const promises: {[key:string]:Promise<void>} = {}

export async function loadPack(guild: Snowflake, pack: string): Promise<{ name: string, rawname: string, cards: any }> {
    const packs = path.join(getFolder(guild), "packs")
    if (!existsSync(packs)) {
        mkdirSync(packs, { recursive: true });
    }
    const p = path.join(packs, pack + ".json");
    if (!existsSync(p)) {
        if (!(pack in promises)) {
            const timestamp = base64(Date.now());
            const exportPath = path.join(packs, timestamp + ".json");

            const url = db[guild].packs[pack];
            if (!url) {
                throw new Error();
            }

            promises[pack] = (async () => {
                const res = await fetch(url)!;
                if (!res.body) {
                    throw new Error();
                }
                const fileStream = createWriteStream(exportPath);
                await new Promise((resolve, reject) => {
                    res.body!.pipe(fileStream);
                    res.body!.on("error", reject);
                    fileStream.on("finish", resolve);
                });
                symlinkSync(exportPath, p);
            })();
            await promises[pack];
            delete promises[pack];
        } else {
            await promises[pack];
        }
    }
    const rawname = lstatSync(p).isSymbolicLink() ? path.basename(readlinkSync(p), ".json") : pack;
    return { name: pack, rawname, cards: JSON.parse(readFileSync(p).toString()) };
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
