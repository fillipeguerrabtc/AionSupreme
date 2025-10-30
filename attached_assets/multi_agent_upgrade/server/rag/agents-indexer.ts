// server/rag/agents-indexer.ts
import { onEvent } from "../events";
import { rebuildNamespaceIndex } from "./knowledge-indexer"; // reuse your indexer if generic

onEvent("AGENT_NAMESPACES_CHANGED", async ({ tenantId, namespaces }) => {
  for (const ns of namespaces) await rebuildNamespaceIndex(tenantId, ns);
});
onEvent("DOC_INGESTED", async ({ tenantId, namespace }) => {
  await rebuildNamespaceIndex(tenantId, namespace);
});
