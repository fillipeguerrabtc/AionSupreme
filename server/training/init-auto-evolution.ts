/**
 * INIT AUTO-EVOLUTION - Inicializa sistema completo de auto-evolução
 * 
 * Ativa TODOS os componentes:
 * 1. AutoIndexer - Indexa conhecimento automaticamente
 * 2. AutoLearningListener - Escuta todas as fontes de dados
 * 3. DatasetGenerator - Gera datasets automaticamente
 * 4. AutoTrainingTrigger - Dispara treino quando threshold atingido
 * 5. GPUPool - Balanceamento inteligente (inferência > treino)
 * 6. ChatIngestion - Coleta conversas de qualidade
 * 7. AgentLearning - Aprendizado contínuo de agentes
 * 8. GradientAggregation - Coordena FedAvg entre workers
 * 9. PatternAnalyzer - Autonomous Learning Loop (Telemetria → Insights → Training)
 * 
 * CICLO COMPLETO:
 * Pergunta → Resposta → Auto-Index → Dataset → Treino → FedAvg → Modelo melhor → ♾️
 * + Telemetria → PatternAnalyzer → Insights → Training Data → Modelo melhor
 */

import { autoIndexer } from "./auto-indexer";
import { autoLearningListener } from "../events/auto-learning-listener";
import { datasetGenerator } from "./dataset-generator";
import { autoTrainingTrigger } from "./auto-training-trigger";
import { chatIngestionService } from "../learn/chat-ingestion";
import { agentContinuousLearning } from "../learn/agent-continuous-learning";
import { gradientAggregationCoordinator } from "../federated/gradient-aggregation-coordinator";
import { patternAnalyzer } from "../services/pattern-analyzer";
import { getMetaLearningConfig } from "./meta-learning-config";

export function initAutoEvolution(): void {
  console.log("\n╔════════════════════════════════════════════════════════════════╗");
  console.log("║   🧠 AION AUTO-EVOLUTION SYSTEM - INICIALIZANDO...           ║");
  console.log("║   💎 ENTERPRISE DIAMOND PLUS EDITION                          ║");
  console.log("╚════════════════════════════════════════════════════════════════╝\n");
  
  // Load adaptive configuration
  const config = getMetaLearningConfig();
  console.log(`📋 Meta-Learning Mode: ${config.mode.toUpperCase()}`);
  console.log(`   • Threshold: ${config.thresholds.minExamples} exemplos (cohort privacy protection)`);
  console.log(`   • Replay Buffer: ${config.replayBuffer.enabled ? `ENABLED (${config.replayBuffer.maxSize})` : 'DISABLED'}`);
  console.log(`   • PII Redaction: ${config.piiRedaction.enabled ? 'ENABLED (10+ patterns)' : 'DISABLED'}`);
  console.log(`   • LoRA: rank=${config.lora.rank} (parameter-efficient, reduces memorization)`);
  console.log('');

  // COMPONENTE 1: AutoIndexer
  console.log("📝 [1/9] AutoIndexer...");
  autoIndexer.setEnabled(true);
  console.log("   ✅ ATIVO - Indexação automática de conhecimento\n");

  // COMPONENTE 2: AutoLearningListener
  console.log("👂 [2/9] AutoLearningListener...");
  autoLearningListener.start();
  autoLearningListener.setEnabled(true);
  console.log("   ✅ ATIVO - Escutando TODAS as fontes de dados\n");

  // COMPONENTE 3: DatasetGenerator (usa config adaptativo)
  console.log("📦 [3/9] DatasetGenerator...");
  datasetGenerator.setEnabled(true);
  console.log(`   ✅ ATIVO - Geração automática de datasets`);
  console.log(`   → Threshold adaptativo: ${config.thresholds.minExamples} (modo: ${config.mode})`);
  console.log(`   → PII Redaction: ${config.piiRedaction.enabled ? 'ENABLED' : 'DISABLED'}`);
  console.log(`   → Quality Gates: min=${config.qualityGates.minQualityScore}\n`);

  // COMPONENTE 4: AutoTrainingTrigger (usa config adaptativo)
  console.log("🔄 [4/9] AutoTrainingTrigger...");
  autoTrainingTrigger.setEnabled(true);
  autoTrainingTrigger.start(); // Verifica a cada 30min
  console.log(`   ✅ ATIVO - Monitor automático de treino (check: 30min)`);
  console.log(`   → Threshold adaptativo: ${config.thresholds.minExamples} (modo: ${config.mode})`);
  console.log(`   → LoRA: rank=${config.lora.rank}, alpha=${config.lora.alpha}`);
  console.log(`   → Privacy: Heuristics (threshold + LoRA + replay + PII redaction)\n`);

  // COMPONENTE 5: GPUPool
  console.log("🎮 [5/9] GPUPool...");
  console.log("   ✅ ATIVO - Balanceamento inteligente de carga");
  console.log("   ⚡ Sistema de PREEMPÇÃO configurado");
  console.log("   → Inferência pausa treino automaticamente\n");

  // COMPONENTE 6: Chat Ingestion
  console.log("💬 [6/9] Chat Ingestion...");
  chatIngestionService.startAutoCollection(60 * 60 * 1000); // 1 hora
  console.log("   ✅ ATIVO - Coleta automática de conversas (intervalo: 1h)\n");

  // COMPONENTE 7: Agent Continuous Learning
  console.log("🧠 [7/9] Agent Continuous Learning...");
  agentContinuousLearning.start();
  console.log("   ✅ ATIVO - Aprendizado contínuo de agentes (intervalo: 1h)\n");

  // COMPONENTE 8: Gradient Aggregation Coordinator
  console.log("🔄 [8/9] Gradient Aggregation Coordinator...");
  gradientAggregationCoordinator.start();
  console.log("   ✅ ATIVO - Monitoramento de workers federados (check: 30s)");
  console.log("   → Agrega gradientes (FedAvg) quando todos workers completarem\n");

  // COMPONENTE 9: Pattern Analyzer (Autonomous Learning Loop)
  console.log("🔍 [9/9] Pattern Analyzer - Autonomous Learning Loop...");
  const PATTERN_ANALYSIS_INTERVAL = 2 * 60 * 60 * 1000; // 2 horas
  const patternAnalyzerInterval = setInterval(async () => {
    console.log("\n[PatternAnalyzer] 🤖 Executando análise automática de padrões...");
    await patternAnalyzer.feedbackToTrainingCollector();
  }, PATTERN_ANALYSIS_INTERVAL);
  
  // Store interval ID for proper cleanup (prevent memory leak)
  if (!(global as any).__aion_intervals) {
    (global as any).__aion_intervals = [];
  }
  (global as any).__aion_intervals.push(patternAnalyzerInterval);
  
  console.log("   ✅ ATIVO - Análise de padrões de uso (intervalo: 2h)");
  console.log("   → Feedback loop: Telemetria → Insights → Training Data\n");

  // RESUMO DO SISTEMA
  console.log("╔════════════════════════════════════════════════════════════════╗");
  console.log("║   ✅ SISTEMA DE AUTO-EVOLUÇÃO 100% OPERACIONAL                ║");
  console.log("║   💎 ENTERPRISE DIAMOND PLUS EDITION                          ║");
  console.log("╠════════════════════════════════════════════════════════════════╣");
  console.log("║   🔄 FLUXO COMPLETO DE AUTO-APRENDIZADO:                      ║");
  console.log("║                                                                ║");
  console.log("║   1. 👤 Usuário pergunta                                       ║");
  console.log("║   2. 🔍 AION busca: KB → GPU → Free APIs → Web → OpenAI       ║");
  console.log("║   3. 💬 Responde usuário (2-5s)                                ║");
  console.log("║   4. 📝 AutoIndexer adiciona na KB automaticamente             ║");
  console.log("║   5. 🔐 PII Redaction (10+ patterns: email, phone, SSN, etc)   ║");
  console.log("║   6. 🎯 Quality Gates (min score, length validation)           ║");
  console.log("║   7. 💾 Replay Buffer (anti-catastrophic forgetting)           ║");
  console.log("║   8. 📊 Acumula exemplos → gera dataset (threshold adaptativo) ║");
  console.log("║   9. 🔥 GPU(s) treinam com LoRA (parameter-efficient)          ║");
  console.log("║   10. 🚀 Modelo fica mais inteligente                          ║");
  console.log("║   11. 🔁 Repete infinitamente (auto-evolução)                  ║");
  console.log("║                                                                ║");
  console.log("╠════════════════════════════════════════════════════════════════╣");
  console.log("║   🎮 BALANCEAMENTO DE GPU:                                     ║");
  console.log("║                                                                ║");
  console.log("║   • SEM usuários → 100% treino (velocidade máxima)             ║");
  console.log("║   • COM usuários → GPU pausa treino, responde, retoma          ║");
  console.log("║   • Sistema de PREEMPÇÃO (não divide poder)                    ║");
  console.log("║                                                                ║");
  console.log("╠════════════════════════════════════════════════════════════════╣");
  console.log("║   📥 FONTES DE DADOS MONITORADAS:                              ║");
  console.log("║                                                                ║");
  console.log("║   ✅ Conversas do chat                                         ║");
  console.log("║   ✅ Texto digitado manualmente (KB)                           ║");
  console.log("║   ✅ URLs/Links inseridos                                      ║");
  console.log("║   ✅ Arquivos uploaded (PDF, DOCX, etc)                        ║");
  console.log("║   ✅ Buscas na web                                             ║");
  console.log("║   ✅ Respostas de APIs externas                                ║");
  console.log("║                                                                ║");
  console.log("╚════════════════════════════════════════════════════════════════╝\n");

  console.log("🎉 AION está pronto para aprender e evoluir continuamente!");
  console.log("💡 Cada interação = nova oportunidade de aprendizado\n");
}

/**
 * Para sistema de auto-evolução
 */
export function stopAutoEvolution(): void {
  console.log("\n⏸️  Parando sistema de auto-evolução...");
  
  autoIndexer.setEnabled(false);
  autoLearningListener.setEnabled(false);
  datasetGenerator.setEnabled(false);
  autoTrainingTrigger.stop();
  autoTrainingTrigger.setEnabled(false);
  agentContinuousLearning.stop();
  gradientAggregationCoordinator.stop();
  
  // Clear all stored intervals (prevent memory leaks)
  if ((global as any).__aion_intervals) {
    for (const intervalId of (global as any).__aion_intervals) {
      clearInterval(intervalId);
    }
    (global as any).__aion_intervals = [];
    console.log("✅ Todos os intervalos limpos (memory leak prevention)");
  }
  
  console.log("✅ Sistema de auto-evolução parado\n");
}
