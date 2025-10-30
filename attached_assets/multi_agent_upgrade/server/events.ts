// server/events.ts
type EventName =
  | "AGENT_CREATED" | "AGENT_UPDATED" | "AGENT_DELETED"
  | "AGENT_NAMESPACES_CHANGED"
  | "DOC_INGESTED" | "DOC_UPDATED" | "DOC_DELETED";

type Handler = (payload: any) => Promise<void>;

const handlers = new Map<EventName, Handler[]>();

export async function publishEvent(name: EventName, payload: any) {
  const list = handlers.get(name) || [];
  for (const h of list) { await h(payload); }
}

export function onEvent(name: EventName, handler: Handler) {
  const list = handlers.get(name) || [];
  list.push(handler);
  handlers.set(name, list);
}
