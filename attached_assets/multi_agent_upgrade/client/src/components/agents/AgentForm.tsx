// client/src/components/agents/AgentForm.tsx
"use client";
import React, { useState } from "react";

export default function AgentForm({ mode }: { mode: "create"|"edit" }) {
  const [form, setForm] = useState<any>({ name: "", slug: "", policy: {}, ragNamespaces: [] });
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/agents", { method: "POST", headers: { "Content-Type": "application/json", "x-tenant-id": "default-tenant" }, body: JSON.stringify(form) });
    if (!res.ok) alert("Erro ao salvar agente"); else alert("Agente criado");
  }
  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div>
        <label className="block text-sm">Nome</label>
        <input className="border p-2 w-full" value={form.name} onChange={e=>setForm({...form, name:e.target.value})} />
      </div>
      <div>
        <label className="block text-sm">Slug</label>
        <input className="border p-2 w-full" value={form.slug} onChange={e=>setForm({...form, slug:e.target.value})} />
      </div>
      <div>
        <label className="block text-sm">System Prompt</label>
        <textarea className="border p-2 w-full" rows={5} value={form.systemPrompt||""} onChange={e=>setForm({...form, systemPrompt:e.target.value})} />
      </div>
      <button className="px-4 py-2 border">Salvar</button>
    </form>
  );
}
