// client/src/components/agents/AgentTable.tsx
"use client";
import React, { useEffect, useState } from "react";

export default function AgentTable() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(()=>{
    fetch("/api/agents", { headers: { "x-tenant-id": "default-tenant" } })
      .then(r=>r.json()).then(setRows).catch(()=>setRows([]));
  }, []);
  return (
    <div className="border p-4">
      <div className="font-semibold mb-2">Agentes existentes</div>
      {rows.length === 0 ? <div className="text-sm opacity-70">Sem dados ainda.</div> :
        <table className="text-sm w-full">
          <thead><tr><th className="text-left">Nome</th><th>Slug</th><th>Tipo</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map((r)=>(
              <tr key={r.id}><td>{r.name}</td><td className="text-center">{r.slug}</td><td className="text-center">{r.type}</td><td className="text-center">{r.enabled? "Ativo":"Inativo"}</td></tr>
            ))}
          </tbody>
        </table>
      }
    </div>
  );
}
