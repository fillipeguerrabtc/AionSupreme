import { searchWeb } from "./search-web";
import { kbSearch } from "./kb-search";
import { execSandbox } from "./exec-sandbox";
import type { AgentObservation } from "../react-engine";

export const agentTools = {
  SearchWeb: searchWeb,
  KBSearch: kbSearch,
  Exec: execSandbox,
  Finish: async (input: { answer: string }): Promise<AgentObservation> => ({
    observation: input.answer,
    success: true,
  }),
};

export type { AgentObservation };
