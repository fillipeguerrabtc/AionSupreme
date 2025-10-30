// client/src/pages/admin/AgentsPage.tsx
import React from "react";
import AgentForm from "../../components/agents/AgentForm";
import AgentTable from "../../components/agents/AgentTable";
import TestBench from "../../components/agents/TestBench";

export default function AgentsPage() {
  return (
    <div className="space-y-8 p-4">
      <h1 className="text-2xl font-semibold">Agentes</h1>
      <AgentForm mode="create" />
      <AgentTable />
      <TestBench />
    </div>
  );
}
