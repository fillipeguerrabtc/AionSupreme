import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Bot, User, Sparkles, Paperclip, Mic, MicOff, X, FileText, Image as ImageIcon, Video } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLanguage, detectMessageLanguage } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";

interface Message {
  id?: number;
  role: "user" | "assistant";
  content: string;
  conversationId?: number;
}

export default function ChatPage() {
  const { t, setLanguage, language } = useLanguage();
  const { toast } = useToast();
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Create or load conversation on mount
  useEffect(() => {
    const initConversation = async () => {
      try {
        // Check if there's a conversation ID in localStorage
        const savedConvId = localStorage.getItem('currentConversationId');
        
        if (savedConvId) {
          // Load existing conversation
          const convResponse = await apiRequest(`/api/conversations/${savedConvId}`);
          const msgsResponse = await apiRequest(`/api/conversations/${savedConvId}/messages`);
          
          const conv = await convResponse.json();
          const msgs = await msgsResponse.json();
          
          setConversationId(Number(savedConvId));
          setMessages(msgs.map((m: any) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            conversationId: m.conversationId,
          })));
        } else {
          // Create new conversation
          const response = await apiRequest("/api/conversations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tenant_id: 1, title: "New Chat" }),
          });
          const newConv = await response.json();
          
          setConversationId(newConv.id);
          localStorage.setItem('currentConversationId', newConv.id.toString());
        }
      } catch (error) {
        console.error("Failed to initialize conversation:", error);
        // Clear stale localStorage key to avoid repeated errors
        localStorage.removeItem('currentConversationId');
        // Create conversation without persistence if database fails
        const tempId = Date.now();
        setConversationId(tempId);
      }
    };
    
    initConversation();
  }, []);

  const sendMutation = useMutation({
    mutationFn: async ({ userMessage, files }: { userMessage: string; files?: File[] }) => {
      if (!conversationId) throw new Error("No conversation active");
      
      const currentMessages = [...messages, { role: "user" as const, content: userMessage }];
      
      // If files attached, use multimodal endpoint
      if (files && files.length > 0) {
        const formData = new FormData();
        formData.append("data", JSON.stringify({
          messages: currentMessages,
          tenant_id: 1,
        }));
        
        files.forEach(file => {
          formData.append("files", file);
        });
        
        const response = await fetch("/api/v1/chat/multimodal", {
          method: "POST",
          body: formData,
        });
        
        if (!response.ok) throw new Error(await response.text());
        const data = await response.json();
        return data.choices[0].message.content;
      }
      
      // Otherwise use regular chat endpoint
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
    onSuccess: async (assistantMessage) => {
      // Save assistant message to database
      if (conversationId) {
        try {
          const response = await apiRequest(`/api/conversations/${conversationId}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              role: "assistant",
              content: assistantMessage,
            }),
          });
          const savedMsg = await response.json();
          
          setMessages(prev => [...prev, {
            id: savedMsg.id,
            role: "assistant",
            content: assistantMessage,
            conversationId: savedMsg.conversationId,
          }]);
        } catch (error) {
          console.error("Failed to save assistant message:", error);
          // Still show message even if save fails
          setMessages(prev => [...prev, { role: "assistant", content: assistantMessage }]);
        }
      } else {
        setMessages(prev => [...prev, { role: "assistant", content: assistantMessage }]);
      }
      
      setAttachedFiles([]);
    },
    onError: (error) => {
      console.error("Erro ao enviar mensagem:", error);
      setMessages(prev => prev.slice(0, -1));
      toast({
        title: "Error",
        description: error.message || "Failed to send message",
        variant: "destructive",
      });
    },
  });

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sendMutation.isPending]);

  const handleSend = async () => {
    if ((!input.trim() && attachedFiles.length === 0) || sendMutation.isPending || !conversationId) return;
    
    const userMessage = input.trim() || `[${attachedFiles.length} file(s) attached]`;
    
    // 🌐 DUAL LANGUAGE DETECTION - Level 2: Realtime message analysis
    // Automatically detect and switch language based on message content
    if (userMessage && userMessage.length > 10) {
      const detectedLang = detectMessageLanguage(userMessage);
      if (detectedLang && detectedLang !== language) {
        console.log(`[Language Detection] Realtime: ${language} → ${detectedLang}`);
        setLanguage(detectedLang);
        toast({
          title: "Language detected",
          description: `Switched to ${detectedLang === "pt-BR" ? "Português" : detectedLang === "es-ES" ? "Español" : "English"}`,
        });
      }
    }
    
    // Save user message to database first
    try {
      const response = await apiRequest(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: "user",
          content: userMessage,
        }),
      });
      const savedMsg = await response.json();
      
      setMessages(prev => [...prev, {
        id: savedMsg.id,
        role: "user",
        content: userMessage,
        conversationId: savedMsg.conversationId,
      }]);
    } catch (error) {
      console.error("Failed to save user message:", error);
      // Still show message even if save fails
      setMessages(prev => [...prev, { role: "user", content: userMessage }]);
    }
    
    setInput("");
    sendMutation.mutate({ userMessage, files: attachedFiles });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length + attachedFiles.length > 5) {
      toast({
        title: "Muitos arquivos",
        description: "Máximo de 5 arquivos permitidos",
        variant: "destructive",
      });
      return;
    }
    
    setAttachedFiles(prev => [...prev, ...files]);
    
    // Show success toast
    toast({
      title: "Arquivo(s) anexado(s)",
      description: `${files.length} arquivo(s) pronto(s) para envio. A IA irá analisar o conteúdo.`,
    });
  };

  const removeFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Try to use audio/webm with opus codec (most compatible)
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : '';
      
      if (!mimeType) {
        throw new Error("Seu navegador não suporta gravação de áudio");
      }
      
      const recorder = new MediaRecorder(stream, { mimeType });
      const audioChunks: BlobPart[] = [];

      recorder.ondataavailable = (e) => {
        audioChunks.push(e.data);
      };

      recorder.onstop = async () => {
        // Determine file extension based on MIME type
        const extension = mimeType.includes('webm') ? 'webm' : 'mp4';
        const audioBlob = new Blob(audioChunks, { type: mimeType });
        const formData = new FormData();
        formData.append("audio", audioBlob, `recording.${extension}`);
        formData.append("tenant_id", "1");

        console.log(`[Audio Recording] MIME type: ${mimeType}, size: ${audioBlob.size} bytes`);

        try {
          const response = await fetch("/api/v1/transcribe", {
            method: "POST",
            body: formData,
          });
          
          if (!response.ok) {
            const errorText = await response.text();
            console.error("[Transcription Error]:", errorText);
            throw new Error(errorText || "Transcription failed");
          }
          const data = await response.json();
          setInput(prev => prev + (prev ? " " : "") + data.text);
          
          toast({
            title: "Transcrição completa",
            description: "Áudio transcrito com sucesso!",
          });
        } catch (error: any) {
          console.error("Transcription error:", error);
          toast({
            title: "Erro na transcrição",
            description: error.message || "Falha ao transcrever áudio. Tente novamente.",
            variant: "destructive",
          });
        }
        
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
    } catch (error: any) {
      console.error("Recording error:", error);
      toast({
        title: "Acesso ao microfone negado",
        description: error.message || "Permita acesso ao microfone para gravar áudio",
        variant: "destructive",
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
      setIsRecording(false);
      setMediaRecorder(null);
    }
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
          
          {/* Invisible element to scroll to */}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Modern Input Composer */}
      <div className="glass border-t border-white/10 p-4">
        <div className="max-w-4xl mx-auto space-y-3">
          {/* Attached Files Preview */}
          {attachedFiles.length > 0 && (
            <div className="flex flex-wrap gap-2" data-testid="files-preview">
              {attachedFiles.map((file, idx) => (
                <div
                  key={idx}
                  className="glass-premium px-3 py-2 rounded-lg flex items-center gap-2 text-sm hover-elevate"
                  data-testid={`file-preview-${idx}`}
                >
                  {file.type.startsWith("image/") ? (
                    <ImageIcon className="w-4 h-4 text-primary" />
                  ) : file.type.startsWith("video/") ? (
                    <Video className="w-4 h-4 text-primary" />
                  ) : (
                    <FileText className="w-4 h-4 text-primary" />
                  )}
                  <span className="max-w-[200px] truncate">{file.name}</span>
                  <button
                    onClick={() => removeFile(idx)}
                    className="ml-1 hover:text-destructive transition-colors"
                    data-testid={`button-remove-file-${idx}`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-3">
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,video/*,.pdf,.doc,.docx,.txt,.xlsx,.xml,.csv"
              onChange={handleFileSelect}
              className="hidden"
              data-testid="input-file"
            />

            {/* File Upload Button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => fileInputRef.current?.click()}
              disabled={sendMutation.isPending}
              className="shrink-0 hover-elevate"
              data-testid="button-attach"
              title="Attach files (images, videos, documents)"
            >
              <Paperclip className="w-5 h-5" />
            </Button>

            {/* Voice Recording Button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={isRecording ? stopRecording : startRecording}
              disabled={sendMutation.isPending}
              className={`shrink-0 hover-elevate ${isRecording ? "text-destructive animate-pulse" : ""}`}
              data-testid="button-record"
              title={isRecording ? "Stop recording" : "Record audio"}
            >
              {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </Button>

            {/* Text Input */}
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
              className="glass border-2 border-primary/60 focus:border-primary focus:ring-2 focus:ring-primary/30 resize-none transition-all duration-300"
              rows={3}
              data-testid="input-message"
            />

            {/* Send Button */}
            <Button
              onClick={handleSend}
              disabled={(!input.trim() && attachedFiles.length === 0) || sendMutation.isPending}
              size="icon"
              className="shrink-0 h-full bg-gradient-to-r from-primary to-accent hover:scale-105 active:scale-95 transition-all duration-300 shadow-lg shadow-primary/25"
              data-testid="button-send"
            >
              <Send className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
