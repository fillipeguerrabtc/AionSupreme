/**
 * 🎯 FASE 2 - D1: Hook para Streaming de Chat via SSE
 * 
 * Gerencia conexão Server-Sent Events para chat em tempo real
 * Features:
 * - Auto-reconnect em caso de erro
 * - Estado de streaming (`isStreaming`, `streamedMessage`, `error`)
 * - Cleanup automático ao desmontar
 * - TypeScript type-safe
 */

import { useState, useCallback, useRef, useEffect } from "react";

export interface StreamingChatState {
  isStreaming: boolean;
  streamedMessage: string;
  error: string | null;
  metadata: Record<string, any> | null;
  completedSuccessfully: boolean; // 🔥 FIX: Flag para auto-save seguro
}

export interface UseStreamingChatReturn extends StreamingChatState {
  sendMessage: (message: string, useMultiAgent?: boolean, language?: string, conversationId?: number | null) => void;
  cancel: () => void;
}

export function useStreamingChat(): UseStreamingChatReturn {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamedMessage, setStreamedMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<Record<string, any> | null>(null);
  const [completedSuccessfully, setCompletedSuccessfully] = useState(false); // 🔥 FIX
  
  const eventSourceRef = useRef<EventSource | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef<number | null>(null);
  const lastMessageRef = useRef<string | null>(null);
  const lastUseMultiAgentRef = useRef<boolean>(true);
  const lastLanguageRef = useRef<string | null>(null); // ✅ FIX BUG #2: Persist language for retries
  const lastConversationIdRef = useRef<number | null>(null); // 🔥 FIX BUG-11: Persist conversationId for retries
  const MAX_RETRIES = 3;

  /**
   * Cancela stream ativo (e para retry loop)
   */
  const cancel = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    retryCountRef.current = 0;
    setIsStreaming(false);
    setCompletedSuccessfully(false);
  }, []);

  /**
   * Tenta reconectar com backoff exponencial
   */
  const retryConnection = useCallback(() => {
    if (retryCountRef.current >= MAX_RETRIES) {
      console.error("[SSE] Max retries reached, giving up");
      setError("Connection failed after multiple retries");
      setIsStreaming(false);
      return;
    }

    const backoffMs = Math.pow(2, retryCountRef.current) * 1000; // 1s, 2s, 4s
    retryCountRef.current++;

    console.log(
      `[SSE] Retry ${retryCountRef.current}/${MAX_RETRIES} in ${backoffMs}ms`
    );

    retryTimeoutRef.current = window.setTimeout(() => {
      if (lastMessageRef.current) {
        console.log("[SSE] Attempting reconnect, clearing partial message...");
        
        // 🔥 CRITICAL FIX: Limpar mensagem parcial antes de retry para evitar duplicação
        setStreamedMessage("");
        
        startStream(lastMessageRef.current, lastUseMultiAgentRef.current, lastLanguageRef.current, lastConversationIdRef.current);
      }
    }, backoffMs);
  }, []);

  /**
   * Inicia stream (ou reinicia)
   */
  const startStream = useCallback((message: string, useMultiAgent: boolean, language: string | null = null, conversationId: number | null = null) => {
    // Fechar stream anterior se existir
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    // ✅ FIX BUG #2 (Multi-language): Adicionar language aos query params
    // 🔥 FIX BUG-11: Adicionar conversationId para manter contexto
    const params = new URLSearchParams({
      message,
      useMultiAgent: useMultiAgent.toString(),
    });
    
    if (language) {
      params.set('language', language);
    }

    if (conversationId !== null) {
      params.set('conversationId', conversationId.toString());
    }

    const url = `/api/chat/stream?${params.toString()}`;

    // Criar EventSource
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    // Handler: start event
    eventSource.addEventListener("start", (e) => {
      const data = JSON.parse(e.data);
      console.log("[SSE] Stream started", data);
    });

    // Handler: chunk event (acumular mensagem)
    eventSource.addEventListener("chunk", (e) => {
      const data = JSON.parse(e.data);
      setStreamedMessage(prev => prev + data.content);
    });

    // Handler: done event (stream concluído com sucesso)
    eventSource.addEventListener("done", (e) => {
      const data = JSON.parse(e.data);
      console.log("[SSE] Stream completed successfully", data);
      setMetadata(data);
      setIsStreaming(false);
      setCompletedSuccessfully(true); // 🔥 FIX: Marca conclusão bem-sucedida para auto-save
      retryCountRef.current = 0; // Reset retry counter on success
      eventSource.close();
      eventSourceRef.current = null;
    });

    // Handler: error event (erro do servidor)
    eventSource.addEventListener("error", (e: any) => {
      const data = e.data ? JSON.parse(e.data) : { error: "Stream failed" };
      console.error("[SSE] Server error event", data);
      setError(data.error || "Unknown error");
      setIsStreaming(false); // OK setar false aqui (erro de servidor, não retry)
      setCompletedSuccessfully(false);
      retryCountRef.current = 0; // Don't retry on server errors
      eventSource.close();
      eventSourceRef.current = null;
    });

    // Handler: connection error (onerror) - RETRY WITH BACKOFF
    eventSource.onerror = (e) => {
      console.error("[SSE] Connection error, attempting retry...", e);
      
      eventSource.close();
      eventSourceRef.current = null;
      
      // 🔥 FIX: NÃO setar isStreaming=false aqui (manter true durante retry)
      // Apenas tentar reconectar
      retryConnection();
    };
  }, [retryConnection]);

  /**
   * Envia mensagem e inicia stream
   * ✅ FIX BUG #2: Aceita language como parâmetro
   * 🔥 FIX BUG-11: Aceita conversationId para manter contexto de conversa
   */
  const sendMessage = useCallback((message: string, useMultiAgent = true, language: string | null = null, conversationId: number | null = null) => {
    // Cancela stream anterior (se existir) + limpa retry
    cancel();

    // Salvar parâmetros para retry
    lastMessageRef.current = message;
    lastUseMultiAgentRef.current = useMultiAgent;
    lastLanguageRef.current = language; // ✅ FIX BUG #2: Salvar language para retry
    lastConversationIdRef.current = conversationId; // 🔥 FIX BUG-11: Salvar conversationId para retry

    // Reset state
    setStreamedMessage("");
    setError(null);
    setMetadata(null);
    setIsStreaming(true);
    setCompletedSuccessfully(false); // 🔥 FIX: Reset flag
    retryCountRef.current = 0;

    // Criar AbortController para cancelamento
    abortControllerRef.current = new AbortController();

    // Iniciar stream
    startStream(message, useMultiAgent, language, conversationId);
  }, [cancel, startStream]);

  /**
   * Cleanup ao desmontar
   */
  useEffect(() => {
    return () => {
      cancel();
    };
  }, [cancel]);

  return {
    isStreaming,
    streamedMessage,
    error,
    metadata,
    completedSuccessfully, // 🔥 FIX: Exportar flag
    sendMessage,
    cancel,
  };
}
