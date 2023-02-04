export type Role = {
    name: string,
    at_night?: Action<true>,  // actions that are applicable are by default group actions
    on_death?: Action<false>, // actions are always individual actions
};

export type BaseAction = {
    action: string,
    uses?: number, // default = infinity
};

export type BaseGroupAction<group extends boolean> = group extends true ? BaseAction & {
    group?: boolean, // default = true
} : BaseAction;

export type BasePlayerAction<group extends boolean> = BaseGroupAction<group> & {
    min_players?: number, // default = 1
    max_players?: number, // default = 1
};

export type PlayerPredicate = {
    in_same_group?: string,
    has_role?: string,
};

export type Action<group extends boolean> = BaseAction & ({
    action: "nothing" | "steal_role",
} | (BasePlayerAction<group> & {
    action: "kill" | "heal" | "view_role",
}) | (BaseGroupAction<group> & {
    action: "choice",
    options: Action<group>[],
}) | (BasePlayerAction<group> & {
    action: "create_group",
    role: string,
}) | (PlayerPredicate & {
    action: "force_kill" | "peek_action",
}));