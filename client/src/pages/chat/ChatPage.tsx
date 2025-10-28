import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Bot, User } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");

  const sendMutation = useMutation({
    mutationFn: async (userMessage: string) => {
      const newMessages = [...messages, { role: "user" as const, content: userMessage }];
      
      const response = await apiRequest("/v1/chat/completions", {
        method: "POST",
        body: JSON.stringify({
          messages: newMessages,
          tenant_id: 1,
        }),
      });
      
      const data = await response.json();
      return data.choices[0].message.content;
    },
    onSuccess: (assistantMessage) => {
      setMessages(prev => [...prev, { role: "assistant", content: assistantMessage }]);
      setInput("");
    },
  });

  const handleSend = () => {
    if (!input.trim()) return;
    setMessages(prev => [...prev, { role: "user", content: input }]);
    sendMutation.mutate(input);
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="border-b p-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-bold">AION - IA Suprema & Ilimitada</h1>
          </div>
          <Button variant="outline" onClick={() => window.location.href = "/admin"} data-testid="button-admin">
            Admin
          </Button>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-4xl mx-auto space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-muted-foreground py-12">
              <Bot className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg">Bem-vindo ao AION</p>
              <p className="text-sm">Sistema de IA autônomo com capacidades ilimitadas</p>
            </div>
          )}
          
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "assistant" && <Bot className="w-6 h-6 mt-1 text-primary" />}
              <Card className={`p-4 max-w-2xl ${msg.role === "user" ? "bg-primary text-primary-foreground" : ""}`}>
                <p className="whitespace-pre-wrap">{msg.content}</p>
              </Card>
              {msg.role === "user" && <User className="w-6 h-6 mt-1" />}
            </div>
          ))}
          
          {sendMutation.isPending && (
            <div className="flex gap-3">
              <Bot className="w-6 h-6 mt-1 text-primary animate-pulse" />
              <Card className="p-4">
                <p className="text-muted-foreground">Pensando...</p>
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* Input */}
      <div className="border-t p-4">
        <div className="max-w-4xl mx-auto flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Digite sua mensagem..."
            className="resize-none"
            rows={3}
            data-testid="input-message"
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || sendMutation.isPending}
            size="icon"
            className="h-full"
            data-testid="button-send"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
