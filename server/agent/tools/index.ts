import { searchWeb } from "./search-web";
import { searchVideos } from "./search-videos";
import { searchImages } from "./search-images";
import { kbSearch } from "./kb-search";
import { execSandbox } from "./exec-sandbox";
import { torSearch } from "./tor-search";
import type { AgentObservation } from "../react-engine";

export const agentTools = {
  SearchWeb: searchWeb,
  SearchVideos: searchVideos,
  SearchImages: searchImages,
  KBSearch: kbSearch,
  TorSearch: torSearch,
  Exec: execSandbox,
  Finish: async (input: { answer: string }): Promise<AgentObservation> => ({
    observation: input.answer,
    success: true,
  }),
};

export type { AgentObservation };
