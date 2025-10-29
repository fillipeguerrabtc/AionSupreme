/**
 * GPU Orchestrator - Gerenciador de GPUs Gratuitas
 * 
 * Gerencia rotação automática entre GPUs gratuitas:
 * - Colab (12h/dia = ~360h/mês)
 * - Kaggle (30h/semana = ~120h/mês)
 * - Modal ($30 créditos = ~20-30h/mês)
 * 
 * Detecta automaticamente qual GPU está online via Ngrok URLs
 * Faz fallback automático para APIs gratuitas quando GPU offline
 * 
 * Documentação: docs/FREE_GPU_API_STRATEGY.md
 */

import { freeLLMProviders } from "./free-llm-providers";
import type { ChatMessage, ChatCompletionResult } from "./llm-client";

interface GPUEndpoint {
  name: string;
  url: string | null;
  lastSeen: Date;
  status: "online" | "offline" | "unknown";
  uptime: number; // horas
}

interface GPUSchedule {
  Monday: "kaggle" | "colab" | "modal";
  Tuesday: "kaggle" | "colab" | "modal";
  Wednesday: "kaggle" | "colab" | "modal";
  Thursday: "colab" | "kaggle" | "modal";
  Friday: "colab" | "kaggle" | "modal";
  Saturday: "modal" | "colab" | "kaggle";
  Sunday: "modal" | "colab" | "kaggle";
}

export class GPUOrchestrator {
  private endpoints: Map<string, GPUEndpoint> = new Map([
    ["colab", { name: "Colab", url: null, lastSeen: new Date(0), status: "unknown", uptime: 0 }],
    ["kaggle", { name: "Kaggle", url: null, lastSeen: new Date(0), status: "unknown", uptime: 0 }],
    ["modal", { name: "Modal", url: null, lastSeen: new Date(0), status: "unknown", uptime: 0 }],
  ]);

  // Rotação recomendada por dia da semana
  private schedule: GPUSchedule = {
    Monday: "colab",      // Colab (12h/dia)
    Tuesday: "colab",     // Colab (12h/dia)
    Wednesday: "colab",   // Colab (12h/dia) = 36h total
    Thursday: "kaggle",   // Kaggle (30h/semana)
    Friday: "kaggle",     // Kaggle (30h/semana)
    Saturday: "modal",    // Modal ($30 créditos)
    Sunday: "modal",      // Modal ($30 créditos)
  };

  constructor() {
    // Iniciar health check periódico
    this.startHealthCheck();
  }

  /**
   * Registrar endpoint de GPU (via Ngrok)
   * Chamado quando usuário inicia Colab/Kaggle/Modal
   */
  async registerGPU(provider: "colab" | "kaggle" | "modal", ngrokUrl: string): Promise<void> {
    const endpoint = this.endpoints.get(provider);
    if (!endpoint) throw new Error(`Provider ${provider} não encontrado`);

    endpoint.url = ngrokUrl;
    endpoint.lastSeen = new Date();
    endpoint.status = "online";

    console.log(`[GPU Orchestrator] ✓ GPU ${provider} registrada: ${ngrokUrl}`);

    // Testar conexão
    await this.checkHealth(provider);
  }

  /**
   * Verificar health de uma GPU específica
   */
  private async checkHealth(provider: string): Promise<boolean> {
    const endpoint = this.endpoints.get(provider);
    if (!endpoint || !endpoint.url) return false;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000); // 3s timeout

      const response = await fetch(`${endpoint.url}/health`, {
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.ok) {
        endpoint.status = "online";
        endpoint.lastSeen = new Date();
        return true;
      }
    } catch (error) {
      // Timeout ou erro de conexão
    }

    endpoint.status = "offline";
    return false;
  }

  /**
   * Health check periódico (a cada 1 minuto)
   */
  private startHealthCheck(): void {
    setInterval(async () => {
      for (const [provider] of Array.from(this.endpoints)) {
        await this.checkHealth(provider);
      }
    }, 60000); // 1 minuto
  }

  /**
   * Obter GPU ativa (online)
   */
  async getActiveGPU(): Promise<GPUEndpoint | null> {
    // Verificar GPU recomendada para hoje primeiro
    const recommended = this.getRecommendedGPU();
    const recommendedEndpoint = this.endpoints.get(recommended);
    
    if (recommendedEndpoint && recommendedEndpoint.status === "online") {
      return recommendedEndpoint;
    }

    // Fallback: procurar qualquer GPU online
    for (const [, endpoint] of Array.from(this.endpoints)) {
      if (endpoint.status === "online" && endpoint.url) {
        return endpoint;
      }
    }

    return null;
  }

  /**
   * Obter GPU recomendada para hoje
   */
  getRecommendedGPU(): "colab" | "kaggle" | "modal" {
    const day = new Date().toLocaleDateString("en-US", { weekday: "long" }) as keyof GPUSchedule;
    return this.schedule[day];
  }

  /**
   * Chat completion usando GPU local ou fallback para APIs gratuitas
   */
  async chatCompletion(messages: ChatMessage[]): Promise<ChatCompletionResult> {
    // 1. Tentar GPU local primeiro
    const gpu = await this.getActiveGPU();

    if (gpu && gpu.url) {
      try {
        console.log(`[GPU Orchestrator] → Usando GPU ${gpu.name}`);
        
        const startTime = Date.now();
        const response = await fetch(`${gpu.url}/v1/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages,
            max_tokens: 2048,
            temperature: 0.7,
          }),
        });

        if (!response.ok) throw new Error(`GPU returned ${response.status}`);

        const data = await response.json();
        const choice = data.choices[0];

        return {
          content: choice.message.content,
          usage: data.usage || { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          finishReason: choice.finish_reason || "stop",
          latencyMs: Date.now() - startTime,
          costUsd: 0, // GPU local = GRÁTIS! 🎉
        };
      } catch (error: any) {
        console.warn(`[GPU Orchestrator] ⚠️  GPU ${gpu.name} falhou:`, error.message);
        // Fallback automático
      }
    }

    // 2. Fallback para APIs gratuitas (Groq → Gemini → HF)
    console.log("[GPU Orchestrator] → Nenhuma GPU online, usando APIs gratuitas");
    return await freeLLMProviders.chatCompletion(messages);
  }

  /**
   * Status completo do orquestrador
   */
  getStatus() {
    const recommended = this.getRecommendedGPU();
    const activeGPU = Array.from(this.endpoints.values()).find(e => e.status === "online");

    return {
      recommended,
      active: activeGPU?.name || null,
      endpoints: Array.from(this.endpoints.entries()).map(([key, endpoint]) => ({
        provider: key,
        name: endpoint.name,
        status: endpoint.status,
        url: endpoint.url,
        lastSeen: endpoint.lastSeen,
        uptime: endpoint.uptime,
      })),
      freeAPIs: freeLLMProviders.getStatus(),
    };
  }

  /**
   * Desregistrar GPU (quando sessão Colab/Kaggle termina)
   */
  unregisterGPU(provider: "colab" | "kaggle" | "modal"): void {
    const endpoint = this.endpoints.get(provider);
    if (!endpoint) return;

    endpoint.url = null;
    endpoint.status = "offline";
    console.log(`[GPU Orchestrator] GPU ${provider} desregistrada`);
  }

  /**
   * Notificar usuário para iniciar GPU recomendada
   * TODO: Implementar notificação via email/SMS
   */
  async notifyUserToStartGPU(): Promise<void> {
    const recommended = this.getRecommendedGPU();
    const endpoint = this.endpoints.get(recommended);

    if (endpoint && endpoint.status === "offline") {
      console.log(`[GPU Orchestrator] 📧 Notificação: Por favor, inicie ${endpoint.name}`);
      
      // TODO: Enviar email/SMS
      // await sendNotification({
      //   title: "Inicie GPU para economia",
      //   message: `Por favor, inicie ${endpoint.name} para usar GPU gratuita hoje.`,
      // });
    }
  }

  /**
   * Auto-start GPU (avançado - requer Selenium)
   * TODO: Implementar automação com Puppeteer
   */
  private async autoStartGPU(provider: string): Promise<void> {
    console.log(`[GPU Orchestrator] 🤖 Auto-start não implementado ainda para ${provider}`);
    
    // TODO: Implementar com Puppeteer/Selenium
    // - Abrir Colab/Kaggle automaticamente
    // - Executar notebook
    // - Aguardar Ngrok URL
    // - Registrar endpoint
  }
}

// Singleton instance
export const gpuOrchestrator = new GPUOrchestrator();
