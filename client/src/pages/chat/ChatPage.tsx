import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Bot, User, Sparkles } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/lib/i18n";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function ChatPage() {
  const { t } = useLanguage();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");

  const sendMutation = useMutation({
    mutationFn: async (userMessage: string) => {
      const currentMessages = [...messages, { role: "user" as const, content: userMessage }];
      
      const response = await apiRequest("/api/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: currentMessages,
          tenant_id: 1,
        }),
      });
      
      const data = await response.json();
      return data.choices[0].message.content;
    },
    onSuccess: (assistantMessage) => {
      setMessages(prev => [...prev, { role: "assistant", content: assistantMessage }]);
    },
    onError: (error) => {
      console.error("Erro ao enviar mensagem:", error);
      setMessages(prev => prev.slice(0, -1));
    },
  });

  const handleSend = () => {
    if (!input.trim() || sendMutation.isPending) return;
    
    const userMessage = input.trim();
    setMessages(prev => [...prev, { role: "user", content: userMessage }]);
    setInput("");
    sendMutation.mutate(userMessage);
  };

  return (
    <div className="flex flex-col h-screen bg-gradient-to-b from-background via-background to-primary/5">
      {/* Modern Minimal Header */}
      <header className="glass sticky top-0 z-50 border-b border-white/10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-primary to-accent rounded-full blur-lg opacity-50" />
            <div className="relative glass-premium p-2 rounded-full">
              <Sparkles className="w-6 h-6 text-primary" />
            </div>
          </div>
          <div>
            <h1 className="text-xl font-bold gradient-text">{t.chat.title}</h1>
            <p className="text-xs text-muted-foreground">{t.chat.subtitle}</p>
          </div>
        </div>
      </header>

      {/* Messages Area with Gradient Background */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {messages.length === 0 && (
            <div className="text-center py-20 space-y-6 animate-fade-in">
              <div className="relative inline-block">
                <div className="absolute inset-0 bg-gradient-to-r from-primary to-accent rounded-full blur-2xl opacity-30" />
                <div className="relative glass-premium p-8 rounded-full">
                  <Bot className="w-16 h-16 text-primary" />
                </div>
              </div>
              <div className="space-y-2">
                <h2 className="text-3xl font-bold gradient-text-vibrant">{t.chat.welcome}</h2>
                <p className="text-muted-foreground max-w-md mx-auto leading-relaxed">
                  {t.chat.welcomeDesc}
                </p>
              </div>
            </div>
          )}
          
          {messages.map((msg, idx) => (
            <div 
              key={idx} 
              className={`flex gap-4 animate-slide-up ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              data-testid={`message-${msg.role}-${idx}`}
            >
              {msg.role === "assistant" && (
                <div className="glass-premium p-2 rounded-full h-10 w-10 flex-shrink-0">
                  <Bot className="w-6 h-6 text-primary" data-testid="icon-bot" />
                </div>
              )}
              
              <div 
                className={`
                  max-w-2xl px-5 py-4 rounded-2xl transition-all duration-300
                  ${msg.role === "user" 
                    ? "glass-premium rounded-br-sm hover-elevate" 
                    : "glass rounded-bl-sm hover-elevate"
                  }
                `}
                data-testid={`card-message-${idx}`}
              >
                <p className="whitespace-pre-wrap leading-relaxed" data-testid={`text-message-${idx}`}>
                  {msg.content}
                </p>
              </div>
              
              {msg.role === "user" && (
                <div className="glass p-2 rounded-full h-10 w-10 flex-shrink-0">
                  <User className="w-6 h-6" data-testid="icon-user" />
                </div>
              )}
            </div>
          ))}
          
          {sendMutation.isPending && (
            <div className="flex gap-4 animate-slide-up">
              <div className="glass-premium p-2 rounded-full h-10 w-10 flex-shrink-0 animate-pulse">
                <Bot className="w-6 h-6 text-primary" />
              </div>
              <div className="glass px-5 py-4 rounded-2xl rounded-bl-sm">
                <div className="flex gap-2">
                  <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modern Input Composer */}
      <div className="glass border-t border-white/10 p-4">
        <div className="max-w-4xl mx-auto flex gap-3">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={t.chat.placeholder}
            className="glass border-primary/20 focus:border-primary/50 focus:ring-2 focus:ring-primary/20 resize-none transition-all duration-300"
            rows={3}
            data-testid="input-message"
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || sendMutation.isPending}
            size="icon"
            className="h-full bg-gradient-to-r from-primary to-accent hover:scale-105 active:scale-95 transition-all duration-300 shadow-lg shadow-primary/25"
            data-testid="button-send"
          >
            <Send className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
