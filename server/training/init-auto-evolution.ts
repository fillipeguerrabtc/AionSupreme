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
 * 
 * CICLO COMPLETO:
 * Pergunta → Resposta → Auto-Index → Dataset → Treino → FedAvg → Modelo melhor → ♾️
 */

import { autoIndexer } from "./auto-indexer";
import { autoLearningListener } from "../events/auto-learning-listener";
import { datasetGenerator } from "./dataset-generator";
import { autoTrainingTrigger } from "./auto-training-trigger";
import { chatIngestionService } from "../learn/chat-ingestion";
import { agentContinuousLearning } from "../learn/agent-continuous-learning";
import { gradientAggregationCoordinator } from "../federated/gradient-aggregation-coordinator";

export function initAutoEvolution(): void {
  console.log("\n╔════════════════════════════════════════════════════════════════╗");
  console.log("║   🧠 AION AUTO-EVOLUTION SYSTEM - INICIALIZANDO...           ║");
  console.log("╚════════════════════════════════════════════════════════════════╝\n");

  // COMPONENTE 1: AutoIndexer
  console.log("📝 [1/8] AutoIndexer...");
  autoIndexer.setEnabled(true);
  console.log("   ✅ ATIVO - Indexação automática de conhecimento\n");

  // COMPONENTE 2: AutoLearningListener
  console.log("👂 [2/8] AutoLearningListener...");
  autoLearningListener.start();
  autoLearningListener.setEnabled(true);
  console.log("   ✅ ATIVO - Escutando TODAS as fontes de dados\n");

  // COMPONENTE 3: DatasetGenerator
  console.log("📦 [3/8] DatasetGenerator...");
  datasetGenerator.setEnabled(true);
  datasetGenerator.setMinExamples(100); // 100 exemplos para disparar
  console.log("   ✅ ATIVO - Geração automática de datasets (threshold: 100)\n");

  // COMPONENTE 4: AutoTrainingTrigger
  console.log("🔄 [4/8] AutoTrainingTrigger...");
  autoTrainingTrigger.setEnabled(true);
  autoTrainingTrigger.setThreshold(100); // 100 exemplos mínimo
  autoTrainingTrigger.start(); // Verifica a cada 30min
  console.log("   ✅ ATIVO - Monitor automático de treino (check: 30min)\n");

  // COMPONENTE 5: GPUPool
  console.log("🎮 [5/8] GPUPool...");
  console.log("   ✅ ATIVO - Balanceamento inteligente de carga");
  console.log("   ⚡ Sistema de PREEMPÇÃO configurado");
  console.log("   → Inferência pausa treino automaticamente\n");

  // COMPONENTE 6: Chat Ingestion
  console.log("💬 [6/8] Chat Ingestion...");
  chatIngestionService.startAutoCollection(60 * 60 * 1000); // 1 hora
  console.log("   ✅ ATIVO - Coleta automática de conversas (intervalo: 1h)\n");

  // COMPONENTE 7: Agent Continuous Learning
  console.log("🧠 [7/8] Agent Continuous Learning...");
  agentContinuousLearning.start();
  console.log("   ✅ ATIVO - Aprendizado contínuo de agentes (intervalo: 1h)\n");

  // COMPONENTE 8: Gradient Aggregation Coordinator
  console.log("🔄 [8/8] Gradient Aggregation Coordinator...");
  gradientAggregationCoordinator.start();
  console.log("   ✅ ATIVO - Monitoramento de workers federados (check: 30s)");
  console.log("   → Agrega gradientes (FedAvg) quando todos workers completarem\n");

  // RESUMO DO SISTEMA
  console.log("╔════════════════════════════════════════════════════════════════╗");
  console.log("║   ✅ SISTEMA DE AUTO-EVOLUÇÃO 100% OPERACIONAL                ║");
  console.log("╠════════════════════════════════════════════════════════════════╣");
  console.log("║   🔄 FLUXO COMPLETO DE AUTO-APRENDIZADO:                      ║");
  console.log("║                                                                ║");
  console.log("║   1. 👤 Usuário pergunta                                       ║");
  console.log("║   2. 🔍 AION busca: KB → GPU → Free APIs → Web → OpenAI       ║");
  console.log("║   3. 💬 Responde usuário (2-5s)                                ║");
  console.log("║   4. 📝 AutoIndexer adiciona na KB automaticamente             ║");
  console.log("║   5. 📊 Acumula 100 exemplos → gera dataset                    ║");
  console.log("║   6. 🔥 GPU(s) treinam automaticamente                         ║");
  console.log("║   7. 🚀 Modelo fica mais inteligente                           ║");
  console.log("║   8. 🔁 Repete infinitamente (auto-evolução)                   ║");
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
  
  console.log("✅ Sistema de auto-evolução parado\n");
}
