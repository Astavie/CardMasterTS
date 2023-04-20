import assert from "assert";
import { ButtonStyle, ComponentType, TextInputStyle, TextInputModalData } from "discord.js";
import { all, ContextOf, forward, GameType, Logic } from "../logic";
import { GameStarter, setup } from "../setup";

const promptLogic: Logic<string, void> = function* (game, players) {

  game.updateMessage(players, {
    embeds: [{ fields: [{
      name: 'Prompt',
      value: '*write a job interview question for others to answer*',
    }]}],
    components: [{
      type: ComponentType.ActionRow,
      components: [{
        type: ComponentType.Button,
        custom_id: 'write',
        style: ButtonStyle.Primary,
        label: 'Write',
      }],
    }],
  }, undefined, false);

  while(true) {
    const event = yield;
    if (event.type === 'interaction') {
      switch (event.interaction.customId) {
        case 'write':
          assert(event.interaction.isButton());
          event.interaction.showModal({
            custom_id: 'writeModal',
            title: 'Write Prompt',
            components: [{
              type: ComponentType.ActionRow,
              components: [{
                type: ComponentType.TextInput,
                custom_id: 'prompt',
                style: TextInputStyle.Paragraph,
                label: 'a tough workplace scenario',
              }],
            }],
          });
          break;
        case 'writeModal':
          assert(event.interaction.isModalSubmit());
          assert(event.interaction.isFromMessage());
          const prompt = (event.interaction.components[0].components[0] as TextInputModalData).value;

          game.closeMessage(players, {
            embeds: [{ fields: [{
              name: 'Prompt',
              value: `> ${prompt}`,
            }]}],
            components: [],
          }, event.interaction, false);

          return prompt;
      }
    }
  }

}

const gameLogic = all(promptLogic, () => {});

type GameContext = ContextOf<typeof gameLogic>;

// setup
const config = [] as const;

const startGame: GameStarter<GameContext, typeof config> = function (game, players, _, i) {
  game.closeLobby(undefined, i);
  game.allowSpectators();
  return { val: {}, ctx: {} };
}

const setupLogic = setup(config, startGame);

// global
const globalLogic = forward(setupLogic, gameLogic);
type GlobalContext = ContextOf<typeof globalLogic>;

export const JJ: GameType<GlobalContext> = {
  name: "JobJob",
  color: 0xffffff,
  logic: globalLogic,
  initialContext() {
    return {
      a: {}
    };
  }
}
