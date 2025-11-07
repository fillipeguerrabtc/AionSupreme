import { searchWeb } from "./search-web";
import { searchVideos } from "./search-videos";
import { searchImages } from "./search-images";
import { kbSearch } from "./kb-search";
import { generateImage } from "./generate-image";
// SECURITY: execSandbox DISABLED - CRITICAL RCE VULNERABILITY
// import { execSandbox } from "./exec-sandbox";
import type { AgentObservation } from "../react-engine";

export const agentTools = {
  SearchWeb: searchWeb,
  SearchVideos: searchVideos,
  SearchImages: searchImages,
  KBSearch: kbSearch,
  GenerateImage: generateImage,
  // SECURITY: Exec tool DISABLED due to CRITICAL RCE vulnerability
  // Enables arbitrary code execution via child_process.exec without proper sandboxing
  // DO NOT RE-ENABLE without implementing proper containerized execution (Docker/Firecracker)
  // Exec: execSandbox,
  Finish: async (input: { answer: string }): Promise<AgentObservation> => ({
    observation: input.answer,
    success: true,
  }),
};

export type { AgentObservation };
