# 📚 AION - Índice Completo de Documentação

Guia de referência rápida para toda documentação do projeto.

---

## 🎯 Por Onde Começar?

**Novo no projeto?**
1. Leia [README.md](./README.md) - Visão geral do sistema
2. Configure o ambiente: [Quick Start no README](./README.md#quick-start)
3. Configure GPU workers grátis: [SETUP_GPU_WORKERS.md](./SETUP_GPU_WORKERS.md)

---

## 📖 Documentação Principal

### Setup e Instalação
- **[README.md](./README.md)** - Visão geral, quick start, features principais
- **[SETUP_GPU_WORKERS.md](./SETUP_GPU_WORKERS.md)** ⭐ **NOVO!** - Setup GPU workers grátis (Colab + Kaggle)
- **[GPU_SCHEDULE_24_7.md](./GPU_SCHEDULE_24_7.md)** ⭐ **NOVO!** - Cronograma otimizado para 24/7 de GPU
- **[GPU_WORKER_SETUP.md](./GPU_WORKER_SETUP.md)** - Setup GPU para video generation (RunPod - PAGO)

### Deployment
- **[DEPLOYMENT_COMPLETE.md](./DEPLOYMENT_COMPLETE.md)** - Status de deployment multi-cloud
- **[GOOGLE_COLAB_DEPLOYMENT.md](./GOOGLE_COLAB_DEPLOYMENT.md)** - ⚠️ Descontinuado - Ver SETUP_GPU_WORKERS.md
- **[CHECKLIST_DEPLOYMENT.md](./CHECKLIST_DEPLOYMENT.md)** - Checklist de deployment

### Arquitetura e Design
- **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)** - Arquitetura técnica completa
- **[docs/TECHNICAL_DOCUMENTATION.md](./docs/TECHNICAL_DOCUMENTATION.md)** - Documentação técnica detalhada
- **[docs/MASTER_SUMMARY.md](./docs/MASTER_SUMMARY.md)** - Resumo executivo do sistema
- **[docs/MATHEMATICAL_FOUNDATIONS.md](./docs/MATHEMATICAL_FOUNDATIONS.md)** - Fundamentos matemáticos (POMDP, ReAct)

### Features Específicas
- **[docs/AUTOMATIC_FALLBACK.md](./docs/AUTOMATIC_FALLBACK.md)** - Sistema de fallback automático
- **[docs/FREE_GPU_API_STRATEGY.md](./docs/FREE_GPU_API_STRATEGY.md)** - Estratégia de APIs e GPUs grátis
- **[docs/API.md](./docs/API.md)** - Documentação da API REST

### Implementação
- **[docs/COMPLETE_IMPLEMENTATION_PLAN.md](./docs/COMPLETE_IMPLEMENTATION_PLAN.md)** - Plano completo de implementação
- **[docs/SETUP_GUIDE.md](./docs/SETUP_GUIDE.md)** - Guia de setup detalhado

### Guias em Português
- **[README_PT-BR.md](./README_PT-BR.md)** - README em Português
- **[docs/GUIA_PASSO_A_PASSO_GOOGLE_COLAB.md](./docs/GUIA_PASSO_A_PASSO_GOOGLE_COLAB.md)** - Guia Colab passo-a-passo
- **[docs/RESUMO_DEPLOYMENT.md](./docs/RESUMO_DEPLOYMENT.md)** - Resumo de deployment

### Memória e Design
- **[replit.md](./replit.md)** - Memória persistente do projeto (decisões, arquitetura)
- **[design_guidelines.md](./design_guidelines.md)** - Diretrizes de design frontend

---

## 🎮 GPU Pool System (Phase 2) - NOVO!

### O Que É?
Sistema de 10 GPUs grátis (5 Colab + 5 Kaggle) com rotação automática, quota management, e auto-shutdown.

### Documentação:
1. **[SETUP_GPU_WORKERS.md](./SETUP_GPU_WORKERS.md)** - Setup completo (15 minutos)
2. **[GPU_SCHEDULE_24_7.md](./GPU_SCHEDULE_24_7.md)** - Cronograma para cobertura 24/7
3. **[notebooks/colab_worker.ipynb](./notebooks/colab_worker.ipynb)** - Worker para Google Colab
4. **[notebooks/kaggle_worker.ipynb](./notebooks/kaggle_worker.ipynb)** - Worker para Kaggle

### Features:
- ✅ ~70-80h/dia de GPU grátis
- ✅ Auto-shutdown 30min antes dos limites
- ✅ Round-robin load balancing
- ✅ Intelligent quota management (70% safety margin)

---

## 📊 Diferenças Entre Guias GPU

| Guia | Propósito | Custo | Workers |
|------|-----------|-------|---------|
| **SETUP_GPU_WORKERS.md** ⭐ | Inferência + Training | **GRÁTIS** | Colab + Kaggle |
| GPU_WORKER_SETUP.md | Video Generation | PAGO (~$0.40-0.80/h) | RunPod + Modal |
| GOOGLE_COLAB_DEPLOYMENT.md | Servidor no Colab | ⚠️ Descontinuado | - |

---

## 🔍 Busca Rápida

### Quero configurar...
- **GPUs grátis** → [SETUP_GPU_WORKERS.md](./SETUP_GPU_WORKERS.md)
- **Video generation** → [GPU_WORKER_SETUP.md](./GPU_WORKER_SETUP.md)
- **Deploy multi-cloud** → [DEPLOYMENT_COMPLETE.md](./DEPLOYMENT_COMPLETE.md)
- **Sistema de fallback** → [docs/AUTOMATIC_FALLBACK.md](./docs/AUTOMATIC_FALLBACK.md)

### Quero entender...
- **Arquitetura geral** → [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)
- **Como funciona RAG** → [docs/TECHNICAL_DOCUMENTATION.md](./docs/TECHNICAL_DOCUMENTATION.md)
- **POMDP e ReAct** → [docs/MATHEMATICAL_FOUNDATIONS.md](./docs/MATHEMATICAL_FOUNDATIONS.md)
- **APIs grátis** → [docs/FREE_GPU_API_STRATEGY.md](./docs/FREE_GPU_API_STRATEGY.md)

### Quero desenvolver...
- **API REST** → [docs/API.md](./docs/API.md)
- **Design frontend** → [design_guidelines.md](./design_guidelines.md)
- **Decisões técnicas** → [replit.md](./replit.md)

---

## 📁 Estrutura de Diretórios

```
AION/
├── README.md                    # Visão geral principal
├── SETUP_GPU_WORKERS.md         # ⭐ Setup GPU grátis
├── GPU_SCHEDULE_24_7.md         # ⭐ Cronograma 24/7
├── GPU_WORKER_SETUP.md          # Video generation (pago)
├── replit.md                    # Memória persistente
│
├── notebooks/                   # ⭐ GPU Workers
│   ├── colab_worker.ipynb      # Colab worker
│   └── kaggle_worker.ipynb     # Kaggle worker
│
├── docs/                        # Documentação técnica
│   ├── ARCHITECTURE.md
│   ├── TECHNICAL_DOCUMENTATION.md
│   ├── AUTOMATIC_FALLBACK.md
│   ├── FREE_GPU_API_STRATEGY.md
│   └── ...
│
├── server/                      # Backend
│   ├── gpu/                    # ⭐ GPU Pool System
│   │   ├── quota-manager.ts   # Quota management
│   │   └── ...
│   └── routes/
│       ├── gpu.ts              # API GPU workers
│       └── ...
│
└── client/                      # Frontend
    └── ...
```

---

## 🆕 Últimas Atualizações

**Phase 2 - GPU Pool System (Outubro 2025)**
- ✅ Sistema de 10 GPU workers grátis
- ✅ Auto-shutdown inteligente
- ✅ Quota management (70% safety)
- ✅ Cronograma 24/7 otimizado
- ✅ ~70-80h/dia de GPU grátis

---

## 📞 Precisa de Ajuda?

1. **Setup básico**: Leia [README.md](./README.md)
2. **GPU grátis**: Veja [SETUP_GPU_WORKERS.md](./SETUP_GPU_WORKERS.md)
3. **Dúvidas técnicas**: Consulte [docs/](./docs/)
4. **Troubleshooting**: Cada guia tem seção de troubleshooting

---

**Última atualização**: Outubro 2025 (Phase 2 - GPU Pool System)
