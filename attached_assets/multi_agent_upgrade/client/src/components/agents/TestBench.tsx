// client/src/components/agents/TestBench.tsx
"use client";
import React, { useState } from "react";
export default function TestBench() {
  const [q,setQ] = useState("");
  const [out,setOut] = useState<any>(null);
  return (
    <div className="border p-4">
      <div className="font-semibold mb-2">Test Bench</div>
      <input className="border p-2 w-full" placeholder="Digite uma query..." value={q} onChange={e=>setQ(e.target.value)} />
      <button className="px-4 py-2 border mt-2" onClick={()=>setOut({ text: "trace (placeholder)"})}>Executar</button>
      {out && <pre className="mt-2 text-xs whitespace-pre-wrap">{JSON.stringify(out,null,2)}</pre>}
    </div>
  );
}
