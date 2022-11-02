import { Client } from "discord.js"

export interface Serializable<T> {
    save(): T
    load(client: Client, data: T): Promise<void>
}
