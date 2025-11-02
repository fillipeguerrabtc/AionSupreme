import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Send, User, Sparkles, Paperclip, Mic, MicOff, X, FileText, Image as ImageIcon, Video, LogIn } from "lucide-react";
import { AionLogo } from "@/components/AionLogo";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLanguage, detectMessageLanguage } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { login } from "@/lib/authUtils";
import { VideoPreview } from "@/components/VideoPreview";
import { ImagePreview } from "@/components/ImagePreview";
import { AttachmentsRenderer } from "@/components/AttachmentsRenderer";

interface Message {
  id?: number;
  role: "user" | "assistant";
  content: string;
  conversationId?: number;
  attachments?: Array<{
    type: "image" | "video" | "audio" | "document";
    url: string;
    filename: string;
    mimeType: string;
    size: number;
  }>;
}

export default function ChatPage() {
  const { t, setLanguage, language } = useLanguage();
  const { toast } = useToast();
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
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
        // Only use localStorage for authenticated users
        if (isAuthenticated) {
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
              attachments: m.attachments,
            })));
            return;
          }
        }
        
        // Create new conversation (for both authenticated and anonymous users)
        const response = await apiRequest("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "New Chat" }),
        });
        const newConv = await response.json();
        
        setConversationId(newConv.id);
        if (isAuthenticated) {
          localStorage.setItem('currentConversationId', newConv.id.toString());
        }
      } catch (error) {
        console.error("Failed to initialize conversation:", error);
        // Clear stale localStorage key to avoid repeated errors
        localStorage.removeItem('currentConversationId');
        // Show error to user
        toast({
          title: "Error",
          description: "Failed to initialize conversation. Please refresh the page.",
          variant: "destructive",
        });
      }
    };
    
    initConversation();
  }, [isAuthenticated]);
  
  // Handler for selecting a conversation from sidebar
  const handleSelectConversation = async (selectedConvId: number) => {
    try {
      const convResponse = await apiRequest(`/api/conversations/${selectedConvId}`);
      const msgsResponse = await apiRequest(`/api/conversations/${selectedConvId}/messages`);
      
      const conv = await convResponse.json();
      const msgs = await msgsResponse.json();
      
      setConversationId(selectedConvId);
      setMessages(msgs.map((m: any) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        conversationId: m.conversationId,
        attachments: m.attachments,
      })));
      
      if (isAuthenticated) {
        localStorage.setItem('currentConversationId', selectedConvId.toString());
      }
    } catch (error) {
      console.error("Failed to load conversation:", error);
      toast({
        title: "Error",
        description: "Failed to load conversation",
        variant: "destructive",
      });
    }
  };
  
  // Handler for creating a new conversation
  const handleNewConversation = async () => {
    try {
      const response = await apiRequest("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "New Chat" }),
      });
      const newConv = await response.json();
      
      setConversationId(newConv.id);
      setMessages([]);
      setInput("");
      setAttachedFiles([]);
      
      if (isAuthenticated) {
        localStorage.setItem('currentConversationId', newConv.id.toString());
      }
      
      // Invalidate conversations list to refresh sidebar
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
    } catch (error) {
      console.error("Failed to create new conversation:", error);
      toast({
        title: "Error",
        description: "Failed to create new conversation",
        variant: "destructive",
      });
    }
  };

  const sendMutation = useMutation({
    mutationFn: async ({ userMessage, files }: { userMessage: string; files?: File[] }) => {
      if (!conversationId) throw new Error("No conversation active");
      
      const currentMessages = [...messages, { role: "user" as const, content: userMessage }];
      
      // If files attached, use multimodal endpoint
      if (files && files.length > 0) {
        const formData = new FormData();
        formData.append("data", JSON.stringify({
          messages: currentMessages,
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
      
      // 🔍 Detect if user needs agent (SearchVideos, SearchWeb, etc)
      const needsAgent = /\b(v[ií]deo|video|buscar?|procur[ae]|find|search|imagem|image|foto|photo|web|internet|deepweb|dark.?web|tor|mostr[ae]|show|exib[ae])/i.test(userMessage);
      
      // Use agent endpoint if needed, otherwise regular chat
      const endpoint = needsAgent ? "/api/agent/chat" : "/api/v1/chat/completions";
      
      console.log(`[Chat] Using ${needsAgent ? 'AGENT' : 'DIRECT'} endpoint for: "${userMessage.slice(0, 50)}..."`);
      
      const response = await apiRequest(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: currentMessages,
        }),
      });
      
      const data = await response.json();
      // MULTIMODAL: Extract both content and attachments
      return {
        content: data.choices[0].message.content,
        attachments: data.choices[0].message.attachments
      };
    },
    onSuccess: async (assistantResponse) => {
      // Save assistant message to database
      if (conversationId) {
        try {
          const response = await apiRequest(`/api/conversations/${conversationId}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              role: "assistant",
              content: assistantResponse.content,
              attachments: assistantResponse.attachments
            }),
          });
          const savedMsg = await response.json();
          
          setMessages(prev => [...prev, {
            id: savedMsg.id,
            role: "assistant",
            content: assistantResponse.content,
            conversationId: savedMsg.conversationId,
            attachments: assistantResponse.attachments
          }]);
        } catch (error) {
          console.error("Failed to save assistant message:", error);
          // Still show message even if save fails
          setMessages(prev => [...prev, { 
            role: "assistant", 
            content: assistantResponse.content,
            attachments: assistantResponse.attachments
          }]);
        }
      } else {
        setMessages(prev => [...prev, { 
          role: "assistant", 
          content: assistantResponse.content,
          attachments: assistantResponse.attachments
        }]);
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
    
    // Create attachment metadata for user's uploaded files
    const userAttachments = attachedFiles.map(file => {
      const type: "image" | "video" | "audio" | "document" = 
        file.type.startsWith('image/') ? 'image' : 
        file.type.startsWith('video/') ? 'video' :
        file.type.startsWith('audio/') ? 'audio' : 'document';
      
      return {
        type,
        url: URL.createObjectURL(file), // Local URL for immediate display
        filename: file.name,
        mimeType: file.type,
        size: file.size
      };
    });
    
    // Save user message to database first
    try {
      const response = await apiRequest(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: "user",
          content: userMessage,
          attachments: userAttachments
        }),
      });
      const savedMsg = await response.json();
      
      setMessages(prev => [...prev, {
        id: savedMsg.id,
        role: "user",
        content: userMessage,
        conversationId: savedMsg.conversationId,
        attachments: userAttachments
      }]);
    } catch (error) {
      console.error("Failed to save user message:", error);
      // Still show message even if save fails
      setMessages(prev => [...prev, { 
        role: "user", 
        content: userMessage,
        attachments: userAttachments
      }]);
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

  // Detect and render video and image links in message content
  const renderMessageContent = (content: string) => {
    const parts: (string | JSX.Element)[] = [];
    let lastIndex = 0;
    let keyCounter = 0;

    // Combined regex for both videos and images (global flag for exec loop)
    const mediaRegex = /(https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|vimeo\.com\/(?:video\/)?|dailymotion\.com\/video\/)[^\s]+|https?:\/\/[^\s]+\.(?:mp4|webm|ogg|mov)|https?:\/\/[^\s]+\.(?:jpg|jpeg|png|gif|webp|svg|bmp|avif)(?:\?[^\s]*)?)/gi;
    
    // NON-global regexes for type detection (avoid lastIndex state issues)
    const videoPattern = /^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|vimeo\.com\/(?:video\/)?|dailymotion\.com\/video\/)[^\s]+|^https?:\/\/[^\s]+\.(?:mp4|webm|ogg|mov)$/;
    const imagePattern = /^https?:\/\/[^\s]+\.(?:jpg|jpeg|png|gif|webp|svg|bmp|avif)(?:\?[^\s]*)?$/i;

    let match;
    while ((match = mediaRegex.exec(content)) !== null) {
      // Add text before the media URL
      if (match.index > lastIndex) {
        const textBefore = content.slice(lastIndex, match.index);
        if (textBefore.trim()) {
          parts.push(
            <p key={`text-${keyCounter++}`} className="whitespace-pre-wrap leading-relaxed">
              {textBefore}
            </p>
          );
        }
      }

      // Sanitize URL: remove trailing punctuation and markdown delimiters
      let sanitizedUrl = match[0].replace(/[.,;:)\]}>]+$/, '');
      
      // Check if it's a video or image using NON-global patterns
      if (videoPattern.test(sanitizedUrl)) {
        parts.push(<VideoPreview key={`video-${keyCounter++}`} url={sanitizedUrl} />);
      } else if (imagePattern.test(sanitizedUrl)) {
        parts.push(<ImagePreview key={`image-${keyCounter++}`} url={sanitizedUrl} />);
      }
      
      lastIndex = match.index + match[0].length;
    }

    // Add remaining text after last media URL
    if (lastIndex < content.length) {
      const textAfter = content.slice(lastIndex);
      if (textAfter.trim()) {
        parts.push(
          <p key={`text-${keyCounter++}`} className="whitespace-pre-wrap leading-relaxed">
            {textAfter}
          </p>
        );
      }
    }

    // If no media found, return original content
    if (parts.length === 0) {
      return (
        <p className="whitespace-pre-wrap leading-relaxed">
          {content}
        </p>
      );
    }

    return <div className="space-y-2">{parts}</div>;
  };

  // Custom sidebar width for chat application
  const sidebarStyle = {
    "--sidebar-width": "20rem",       // 320px for better content
    "--sidebar-width-icon": "4rem",   // default icon width
  };

  // Render without sidebar when not authenticated
  if (!isAuthenticated) {
    return (
      <div className="flex flex-col h-screen w-full bg-background">
          {/* Minimal Header - Apple/Tesla Style */}
          <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-glass">
            <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {isAuthenticated && (
                  <SidebarTrigger data-testid="button-sidebar-toggle" className="mr-2" />
                )}
                <button 
                  onClick={() => navigate("/")} 
                  className="flex items-center gap-3 hover-elevate rounded-lg px-2 py-1 -mx-2 transition-all bg-transparent border-0 cursor-pointer" 
                  data-testid="link-logo-home"
                >
                  <AionLogo showText={false} size="md" />
                  <div>
                    <h1 className="text-xl font-bold text-foreground">{t.chat.title}</h1>
                    <p className="text-xs text-muted-foreground">Chat</p>
                  </div>
                </button>
              </div>
              
              {!isAuthenticated && (
                <Button
                  onClick={login}
                  variant="ghost"
                  size="sm"
                  className="text-sm"
                  data-testid="button-login-header"
                >
                  <LogIn className="w-4 h-4 mr-2" />
                  Login
                </Button>
              )}
            </div>
          </header>

      {/* Messages Area with Gradient Background */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {messages.length === 0 && (
            <div className="text-center py-32 space-y-6 animate-fade-in">
              <div className="space-y-4">
                <h2 className="text-3xl font-semibold text-foreground tracking-tight font-[Plus_Jakarta_Sans]">{t.chat.welcome}</h2>
                <p className="text-muted-foreground max-w-lg mx-auto leading-relaxed text-base">
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
                <div className="rounded-full h-12 w-12 flex-shrink-0 flex items-center justify-center overflow-hidden border-2 border-border bg-white">
                  <img 
                    src="/cat.gif" 
                    alt="Gatinho"
                    className="w-full h-full object-cover"
                    data-testid="icon-bot"
                  />
                </div>
              )}
              
              <div 
                className={`
                  max-w-2xl px-5 py-4 rounded-xl transition-all duration-200 border
                  ${msg.role === "user" 
                    ? "bg-card border-border rounded-br-sm hover-elevate" 
                    : "bg-muted border-transparent rounded-bl-sm hover-elevate"
                  }
                `}
                data-testid={`card-message-${idx}`}
              >
                <div data-testid={`text-message-${idx}`}>
                  {renderMessageContent(msg.content)}
                  {msg.attachments && msg.attachments.length > 0 && (
                    <AttachmentsRenderer attachments={msg.attachments} />
                  )}
                </div>
              </div>
              
              {msg.role === "user" && (
                <div className="bg-primary/10 border border-primary/20 p-2 rounded-full h-10 w-10 flex-shrink-0">
                  <User className="w-6 h-6 text-primary" data-testid="icon-user" />
                </div>
              )}
            </div>
          ))}
          
          {sendMutation.isPending && (
            <div className="flex gap-4 animate-slide-up">
              <div className="rounded-full h-12 w-12 flex-shrink-0 flex items-center justify-center overflow-hidden border-2 border-border bg-white animate-pulse">
                <img 
                  src="/cat.gif" 
                  alt="Gatinho"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="bg-muted px-5 py-4 rounded-xl rounded-bl-sm border border-transparent">
                <div className="flex gap-2">
                  <span className="w-2 h-2 bg-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 bg-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 bg-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}
          
          {/* Invisible element to scroll to */}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Minimal Input Composer */}
      <div className="bg-background border-t p-4">
        <div className="max-w-4xl mx-auto space-y-3">
          {/* Attached Files Preview */}
          {attachedFiles.length > 0 && (
            <div className="flex flex-wrap gap-2" data-testid="files-preview">
              {attachedFiles.map((file, idx) => (
                <div
                  key={idx}
                  className="bg-muted border px-3 py-2 rounded-lg flex items-center gap-2 text-sm hover-elevate"
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
              className="bg-background border-2 border-border focus:border-primary focus:ring-2 focus:ring-primary/20 resize-none transition-all duration-200"
              rows={3}
              data-testid="input-message"
            />

            {/* Send Button */}
            <Button
              onClick={handleSend}
              disabled={(!input.trim() && attachedFiles.length === 0) || sendMutation.isPending}
              size="icon"
              className="shrink-0 h-full bg-primary hover-elevate active-elevate-2"
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

  // Render with sidebar when authenticated
  return (
    <SidebarProvider style={sidebarStyle as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar
          currentConversationId={conversationId}
          onSelectConversation={handleSelectConversation}
          onNewConversation={handleNewConversation}
        />
        
        <div className="flex flex-col flex-1 bg-background">
          {/* Minimal Header - Apple/Tesla Style */}
          <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-glass">
            <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <SidebarTrigger data-testid="button-sidebar-toggle" className="mr-2" />
                <button 
                  onClick={() => navigate("/")} 
                  className="flex items-center gap-3 hover-elevate rounded-lg px-2 py-1 -mx-2 transition-all bg-transparent border-0 cursor-pointer" 
                  data-testid="link-logo-home"
                >
                  <AionLogo showText={false} size="md" />
                  <div>
                    <h1 className="text-xl font-bold text-foreground">{t.chat.title}</h1>
                    <p className="text-xs text-muted-foreground">Chat</p>
                  </div>
                </button>
              </div>
            </div>
          </header>

      {/* Messages Area with Gradient Background */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {messages.length === 0 && (
            <div className="text-center py-32 space-y-6 animate-fade-in">
              <div className="space-y-4">
                <h2 className="text-3xl font-semibold text-foreground tracking-tight font-[Plus_Jakarta_Sans]">{t.chat.welcome}</h2>
                <p className="text-muted-foreground max-w-lg mx-auto leading-relaxed text-base">
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
                <div className="rounded-full h-12 w-12 flex-shrink-0 flex items-center justify-center overflow-hidden border-2 border-border bg-white">
                  <img 
                    src="/cat.gif" 
                    alt="Gatinho"
                    className="w-full h-full object-cover"
                    data-testid="icon-bot"
                  />
                </div>
              )}
              
              <div 
                className={`
                  max-w-2xl px-5 py-4 rounded-xl transition-all duration-200 border
                  ${msg.role === "user" 
                    ? "bg-card border-border rounded-br-sm hover-elevate" 
                    : "bg-muted border-transparent rounded-bl-sm hover-elevate"
                  }
                `}
                data-testid={`card-message-${idx}`}
              >
                <div data-testid={`text-message-${idx}`}>
                  {renderMessageContent(msg.content)}
                  {msg.attachments && msg.attachments.length > 0 && (
                    <AttachmentsRenderer attachments={msg.attachments} />
                  )}
                </div>
              </div>
              
              {msg.role === "user" && (
                <div className="bg-primary/10 border border-primary/20 p-2 rounded-full h-10 w-10 flex-shrink-0">
                  <User className="w-6 h-6 text-primary" data-testid="icon-user" />
                </div>
              )}
            </div>
          ))}
          
          {sendMutation.isPending && (
            <div className="flex gap-4 animate-slide-up">
              <div className="rounded-full h-12 w-12 flex-shrink-0 flex items-center justify-center overflow-hidden border-2 border-border bg-white animate-pulse">
                <img 
                  src="/cat.gif" 
                  alt="Gatinho"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="bg-muted px-5 py-4 rounded-xl rounded-bl-sm border border-transparent">
                <div className="flex gap-2">
                  <span className="w-2 h-2 bg-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 bg-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 bg-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}
          
          {/* Invisible element to scroll to */}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Minimal Input Composer */}
      <div className="bg-background border-t p-4">
        <div className="max-w-4xl mx-auto space-y-3">
          {/* Attached Files Preview */}
          {attachedFiles.length > 0 && (
            <div className="flex flex-wrap gap-2" data-testid="files-preview">
              {attachedFiles.map((file, idx) => (
                <div
                  key={idx}
                  className="bg-muted border px-3 py-2 rounded-lg flex items-center gap-2 text-sm hover-elevate"
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
              className="bg-background border-2 border-border focus:border-primary focus:ring-2 focus:ring-primary/20 resize-none transition-all duration-200"
              rows={3}
              data-testid="input-message"
            />

            {/* Send Button */}
            <Button
              onClick={handleSend}
              disabled={(!input.trim() && attachedFiles.length === 0) || sendMutation.isPending}
              size="icon"
              className="shrink-0 h-full bg-primary hover-elevate active-elevate-2"
              data-testid="button-send"
            >
              <Send className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>
        </div>
      </div>
    </SidebarProvider>
  );
}
