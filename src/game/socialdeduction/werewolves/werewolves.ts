import { Role } from "../sdlib";

const burger: Role = {
    name: "Burger"
};

const Dief: Role = {
    name: "Dief",
    at_night: {
        action: "steal_role",
    },
};

const ziener: Role = {
    name: "Ziener",
    at_night: {
        action: "view_role",
    },
};

const weerwolf: Role = {
    name: "Weerwolf",
    at_night: {
        action: "kill",
        group: true,
    },
};

const heks: Role = {
    name: "Heks",
    at_night: {
        action: "choice",
        options: [{
            action: "heal",
            uses: 1,
        }, {
            action: "kill",
            uses: 1,
        }, {
            action: "nothing",
        }],
    },
};

// yes, the lovers are a separate role
// people can have multiple roles owo
const geliefde: Role = {
    name: "Geliefde",
    on_death: {
        action: "force_kill",
        in_same_group: "Geliefde",
    },
};

const cupido: Role = {
    name: "Cupido",
    at_night: {
        action: "create_group",
        role: "Geliefde",
        min_players: 2,
        max_players: 2,
        uses: 1,
    },
};

const jager: Role = {
    name: "Jager",
    on_death: {
        action: "kill",
    },
};

// group of players who are either a werewolf or present at werewolf activities
const wolvenhol: Role = {
    name: "Wolvenhol",
};

const spiekend_meisje: Role = {
    name: "Spiekend Meisje",
    at_night: {
        // the spiekend meisje can look at which werewolves vote for what, gaining a bit more information than just who dies
        action: "peek_action",
        in_same_group: "Wolvenhol",
        // has_role: "Weerwolf",
    },
};