/**
 * PROVIDER ALTERNATION SERVICE
 * =============================
 * 
 * Garante que nunca ligamos 2 GPUs do mesmo provider seguidas.
 * 
 * 🔥 PERSISTENCE: State salvo em PostgreSQL para sobreviver restarts!
 * 
 * ESTRATÉGIA:
 * - Desligou Colab → Próxima deve ser Kaggle
 * - Desligou Kaggle → Próxima deve ser Colab
 * 
 * OBJETIVO:
 * Evitar padrão suspeito de "só Colab" ou "só Kaggle" consecutivos
 * que pode acionar alarmes de abuse detection.
 * 
 * EXEMPLO:
 * T=0h: Start Colab A (8.4h)
 * T=8.4h: Stop Colab A → Start KAGGLE B (não outro Colab!)
 * T=16.8h: Stop Kaggle B → Start COLAB C (não outro Kaggle!)
 */

import { db } from '../db';
import { providerAlternationState } from '../../shared/schema';
import { eq } from 'drizzle-orm';

export type Provider = 'colab' | 'kaggle';

interface AlternationState {
  lastProviderStarted: Provider | null;
  lastProviderStopped: Provider | null;
  startHistory: Array<{ provider: Provider; timestamp: Date }>;
  stopHistory: Array<{ provider: Provider; timestamp: Date }>;
}

export class ProviderAlternationService {
  private state: AlternationState = {
    lastProviderStarted: null,
    lastProviderStopped: null,
    startHistory: [],
    stopHistory: [],
  };

  private initialized = false;

  /**
   * 🔥 INITIALIZE: Carregar state do PostgreSQL ao boot
   * 
   * FIX: UPSERT para evitar race condition em multi-instance boots
   * FIX: Converte ISO strings → Date objects ao carregar history
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return; // Já inicializado
    }

    try {
      // 🔥 FIX: UPSERT atômico (evita race condition!)
      const [row] = await db
        .insert(providerAlternationState)
        .values({
          id: 1,
          lastProviderStarted: null,
          lastProviderStopped: null,
          startHistory: [],
          stopHistory: [],
        })
        .onConflictDoNothing()  // Se já existe, ignora
        .returning();

      // Buscar registro atual (garantido existir após upsert)
      const existing = await db.query.providerAlternationState.findFirst({
        where: eq(providerAlternationState.id, 1),
      });

      if (!existing) {
        throw new Error('UPSERT falhou - registro não encontrado');
      }

      // 🔥 FIX: Converter ISO strings → Date objects
      const parseHistory = (history: any[]): Array<{ provider: Provider; timestamp: Date }> => {
        return history.map(h => ({
          provider: h.provider,
          timestamp: typeof h.timestamp === 'string' ? new Date(h.timestamp) : h.timestamp,
        }));
      };

      // Carregar state do banco
      this.state = {
        lastProviderStarted: (existing.lastProviderStarted as Provider) || null,
        lastProviderStopped: (existing.lastProviderStopped as Provider) || null,
        startHistory: parseHistory((existing.startHistory as any[]) || []),
        stopHistory: parseHistory((existing.stopHistory as any[]) || []),
      };

      console.log('[ProviderAlternation] ✅ State carregado do PostgreSQL');
      console.log(`   Last Started: ${this.state.lastProviderStarted || 'none'}`);
      console.log(`   Last Stopped: ${this.state.lastProviderStopped || 'none'}`);
      console.log(`   History: ${this.state.startHistory.length} starts, ${this.state.stopHistory.length} stops`);

      this.initialized = true;
    } catch (error: any) {
      console.error('[ProviderAlternation] ❌ Erro ao inicializar:', error.message);
      throw error;
    }
  }

  /**
   * 🔥 PERSIST: Salvar state no PostgreSQL
   * 
   * FIX: Serializa Date → ISO string explicitamente
   */
  private async persist(): Promise<void> {
    try {
      // 🔥 FIX: Converter Date → ISO string explicitamente
      const serializeHistory = (history: Array<{ provider: Provider; timestamp: Date }>) => {
        return history.map(h => ({
          provider: h.provider,
          timestamp: h.timestamp.toISOString(),  // Date → string ISO
        }));
      };

      await db.update(providerAlternationState)
        .set({
          lastProviderStarted: this.state.lastProviderStarted,
          lastProviderStopped: this.state.lastProviderStopped,
          startHistory: serializeHistory(this.state.startHistory) as any,
          stopHistory: serializeHistory(this.state.stopHistory) as any,
          updatedAt: new Date(),
        })
        .where(eq(providerAlternationState.id, 1));
    } catch (error: any) {
      console.error('[ProviderAlternation] ❌ Erro ao persistir:', error.message);
    }
  }

  /**
   * Determine próximo provider a ser iniciado (alternado!)
   * 
   * @returns 'colab' ou 'kaggle' baseado no último que foi parado
   */
  getNextProviderToStart(): Provider {
    // Se parou Colab, próximo deve ser Kaggle
    if (this.state.lastProviderStopped === 'colab') {
      console.log('[ProviderAlternation] 🔄 Último stop foi Colab → Próximo start: KAGGLE');
      return 'kaggle';
    }
    
    // Se parou Kaggle, próximo deve ser Colab
    if (this.state.lastProviderStopped === 'kaggle') {
      console.log('[ProviderAlternation] 🔄 Último stop foi Kaggle → Próximo start: COLAB');
      return 'colab';
    }
    
    // Caso inicial: preferir Colab (sem limite weekly)
    console.log('[ProviderAlternation] 🆕 Estado inicial → Preferir COLAB');
    return 'colab';
  }

  /**
   * Verificar se provider está OK para iniciar (não viola alternância)
   * 
   * @param provider - Provider a ser verificado
   * @returns true se pode iniciar, false se deve esperar alternância
   */
  canStartProvider(provider: Provider): boolean {
    const recommended = this.getNextProviderToStart();
    
    if (provider === recommended) {
      console.log(`[ProviderAlternation] ✅ ${provider} está alinhado com alternância`);
      return true;
    }
    
    console.log(`[ProviderAlternation] ⚠️ ${provider} viola alternância (recomendado: ${recommended})`);
    return false;
  }

  /**
   * Registrar que provider foi iniciado
   * 
   * 🔥 UPDATED: Persiste no PostgreSQL atomicamente!
   */
  async recordProviderStarted(provider: Provider): Promise<void> {
    this.state.lastProviderStarted = provider;
    this.state.startHistory.push({
      provider,
      timestamp: new Date(),
    });
    
    // Manter apenas últimos 20 registros
    if (this.state.startHistory.length > 20) {
      this.state.startHistory.shift();
    }
    
    console.log(`[ProviderAlternation] 📝 Registrado START: ${provider}`);
    
    // 🔥 Persistir no banco
    await this.persist();
  }

  /**
   * Registrar que provider foi parado
   * 
   * 🔥 UPDATED: Persiste no PostgreSQL atomicamente!
   */
  async recordProviderStopped(provider: Provider): Promise<void> {
    this.state.lastProviderStopped = provider;
    this.state.stopHistory.push({
      provider,
      timestamp: new Date(),
    });
    
    // Manter apenas últimos 20 registros
    if (this.state.stopHistory.length > 20) {
      this.state.stopHistory.shift();
    }
    
    console.log(`[ProviderAlternation] 📝 Registrado STOP: ${provider}`);
    
    // 🔥 Persistir no banco
    await this.persist();
  }

  /**
   * Get human-readable alternation pattern
   */
  getAlternationPattern(): string {
    const recent = this.state.startHistory.slice(-5).map(h => h.provider);
    return recent.join(' → ') || 'empty';
  }

  /**
   * Reset state (para testes)
   */
  reset(): void {
    this.state = {
      lastProviderStarted: null,
      lastProviderStopped: null,
      startHistory: [],
      stopHistory: [],
    };
    console.log('[ProviderAlternation] 🔄 State reset');
  }

  /**
   * Get full state (para debugging)
   */
  getState(): AlternationState {
    return { ...this.state };
  }
}

// Singleton
export const providerAlternationService = new ProviderAlternationService();

/**
 * HUMAN-LIKE DELAY UTILITIES
 * ===========================
 * 
 * Adiciona variação humana nos timings para parecer menos robotizado.
 */

/**
 * Get delay com variação humana (±30%)
 * 
 * @param baseMs - Delay base em milliseconds
 * @returns Delay variado em milliseconds
 */
export function getHumanDelay(baseMs: number): number {
  const variance = baseMs * 0.3; // ±30% variação
  const randomOffset = Math.random() * variance * 2 - variance;
  const humanDelay = Math.max(1000, baseMs + randomOffset); // Mínimo 1s
  
  return Math.floor(humanDelay);
}

/**
 * Sleep com delay humano
 * 
 * @param baseMs - Delay base em milliseconds
 */
export async function sleepHuman(baseMs: number): Promise<void> {
  const delay = getHumanDelay(baseMs);
  return new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Get delay progressivo (aumenta a cada chamada)
 * 
 * Útil para evitar que múltiplos workers iniciem exatamente ao mesmo tempo.
 * 
 * @param index - Índice do worker no grupo (0, 1, 2, ...)
 * @param baseMs - Delay base em milliseconds
 * @returns Delay progressivo com variação humana
 */
export function getProgressiveDelay(index: number, baseMs: number = 3000): number {
  const progressive = baseMs + (index * 1000); // +1s por cada worker
  return getHumanDelay(progressive);
}
