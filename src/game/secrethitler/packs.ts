import type { CardPack } from "./secrethitler";

export const BasePack: CardPack = {
    name: "Base Pack",

    hitler: "Hitler",
    vice: "Fascist",

    liberal: ["Liberal", "Liberal", "Liberal", "Liberal", "Liberal", "Liberal"],
    fascist: ["Fascist", "Fascist"],
}

export const TrumpPack: CardPack = {
    name: "Trump Pack",

    hitler: "Trump",
    vice: "Pence",

    liberal: ["Liberal", "Liberal", "Liberal", "Liberal", "Liberal", "Liberal"],
    fascist: ["Spicer", "Bannon", "Miller"],
}
