// server/curation/store.ts
// Store de curadoria com HITL (Human-in-the-Loop)

export interface CurationItem {
  id: string;
  tenantId: number;
  title: string;
  content: string;
  suggestedNamespaces: string[];
  tags: string[];
  status: "pending" | "approved" | "rejected";
  submittedBy?: string;
  submittedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  note?: string;
  publishedId?: string;
}

// In-memory store (substituir por DB real em produção)
const curationQueue: CurationItem[] = [];
let nextId = 1;

export const curationStore = {
  /**
   * Adiciona item à fila de curadoria
   */
  async addToCuration(
    tenantId: number,
    data: {
      title: string;
      content: string;
      suggestedNamespaces: string[];
      tags?: string[];
      submittedBy?: string;
    }
  ): Promise<CurationItem> {
    const item: CurationItem = {
      id: `curation_${nextId++}`,
      tenantId,
      title: data.title,
      content: data.content,
      suggestedNamespaces: data.suggestedNamespaces,
      tags: data.tags || [],
      status: "pending",
      submittedBy: data.submittedBy,
      submittedAt: new Date().toISOString(),
    };

    curationQueue.push(item);
    return item;
  },

  /**
   * Lista itens pendentes de curadoria
   */
  async listPending(tenantId: number): Promise<CurationItem[]> {
    return curationQueue.filter(
      item => item.tenantId === tenantId && item.status === "pending"
    );
  },

  /**
   * Lista todos os itens (com filtros opcionais)
   */
  async listAll(
    tenantId: number,
    filters?: { status?: string; limit?: number }
  ): Promise<CurationItem[]> {
    let items = curationQueue.filter(item => item.tenantId === tenantId);

    if (filters?.status) {
      items = items.filter(item => item.status === filters.status);
    }

    if (filters?.limit) {
      items = items.slice(0, filters.limit);
    }

    return items.sort((a, b) => 
      new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
    );
  },

  /**
   * Obtém item por ID
   */
  async getById(tenantId: number, id: string): Promise<CurationItem | null> {
    const item = curationQueue.find(
      i => i.id === id && i.tenantId === tenantId
    );
    return item || null;
  },

  /**
   * Edita item pendente (título, tags, namespaces)
   */
  async editItem(
    tenantId: number,
    id: string,
    updates: {
      title?: string;
      tags?: string[];
      suggestedNamespaces?: string[];
      note?: string;
    }
  ): Promise<CurationItem | null> {
    const item = await this.getById(tenantId, id);
    if (!item || item.status !== "pending") return null;

    if (updates.title !== undefined) item.title = updates.title;
    if (updates.tags !== undefined) item.tags = updates.tags;
    if (updates.suggestedNamespaces !== undefined) {
      item.suggestedNamespaces = updates.suggestedNamespaces;
    }
    if (updates.note !== undefined) item.note = updates.note;

    return item;
  },

  /**
   * Aprova e publica item
   * TODO: Integrar com KB real (criar documento versionado)
   */
  async approveAndPublish(
    tenantId: number,
    id: string,
    reviewedBy: string
  ): Promise<{ item: CurationItem; publishedId: string }> {
    const item = await this.getById(tenantId, id);
    if (!item || item.status !== "pending") {
      throw new Error("Item not found or already processed");
    }

    item.status = "approved";
    item.reviewedBy = reviewedBy;
    item.reviewedAt = new Date().toISOString();

    // TODO: Integrar com publishToKB real
    // const publishedId = await publishToKB({
    //   title: item.title,
    //   content: item.content,
    //   namespaces: item.suggestedNamespaces,
    //   tags: item.tags,
    // });
    const publishedId = `kb_doc_${Date.now()}`;
    item.publishedId = publishedId;

    return { item, publishedId };
  },

  /**
   * Rejeita item
   */
  async reject(
    tenantId: number,
    id: string,
    reviewedBy: string,
    note?: string
  ): Promise<CurationItem | null> {
    const item = await this.getById(tenantId, id);
    if (!item || item.status !== "pending") return null;

    item.status = "rejected";
    item.reviewedBy = reviewedBy;
    item.reviewedAt = new Date().toISOString();
    if (note) item.note = note;

    return item;
  },

  /**
   * Remove item da fila (apenas para testes)
   */
  async remove(tenantId: number, id: string): Promise<boolean> {
    const index = curationQueue.findIndex(
      i => i.id === id && i.tenantId === tenantId
    );
    if (index === -1) return false;

    curationQueue.splice(index, 1);
    return true;
  },
};
