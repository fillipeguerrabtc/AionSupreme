# Índice de Documentação Técnica - 19 PDFs

Este documento organiza os 19 PDFs técnicos que fundamentam o sistema AION.

## 📚 Organização

Todos os PDFs estão localizados em: [`docs/pdfs/`](./pdfs/)

## 📖 Lista Completa de PDFs

### Fundamentos Teóricos (Partes 1-2)

| Parte | Arquivo | Descrição | Tamanho |
|-------|---------|-----------|---------|
| **Parte 01** | `Parte01.pdf` | **Fundamentos Teóricos**<br/>Transformer Denso, MoE, RoPE, FlashAttention, LoRA, Cross-Entropy, AdamW, PPO/RLHF, Leis de Escalonamento | 337 KB |
| **Parte 02** | `Parte02.pdf` | **Arquitetura Sistêmica**<br/>Multimodalidade (texto/imagem/áudio/vídeo), RAG/Memória Vetorial, Agência Autônoma ReAct, Dashboard de Políticas | 263 KB |

### Arquitetura do Sistema (Partes 3.1-3.4)

| Parte | Arquivo | Descrição | Tamanho |
|-------|---------|-----------|---------|
| **Parte 03-1** | `Parte03-1.pdf` | **Modelo Transformer-MoE**<br/>Arquitetura, dedução matemática da atenção, RoPE, MoE com balanceamento, otimização | 245 KB |
| **Parte 03-2** | `Parte03-2.pdf` | **Multimodalidade Completa**<br/>Encoders por modalidade, fusão, perdas conjuntas, RAG com embeddings semânticos | 228 KB |
| **Parte 03-3** | `Parte03-3.pdf` | **Agência Autônoma**<br/>POMDP, ReAct, ferramentas, sandbox, eficiência computacional, separação de políticas | 273 KB |
| **Parte 03-4** | `Parte03-4.pdf` | **Implementação e Deploy**<br/>Topologia de sistema, pipeline de inferência, quantização, checkpoints, execução no Replit | 386 KB |

### Apêndices e Implementação Detalhada (Partes 4-16)

| Parte | Arquivo | Descrição | Tamanho |
|-------|---------|-----------|---------|
| **Parte 04** | `Parte04.pdf` | **Apêndices Matemáticos**<br/>Dedução completa da atenção escalonada, estabilidade MoE, derivação formal PPO, leis de escalonamento | 590 KB |
| **Parte 05** | `Parte05.pdf` | **Implementação Prática - Parte 1**<br/>Detalhes de implementação técnica | 557 KB |
| **Parte 06** | `Parte06.pdf` | **Implementação Prática - Parte 2**<br/>Continuação dos detalhes técnicos | 573 KB |
| **Parte 07** | `Parte07.pdf` | **Implementação Prática - Parte 3**<br/>Aspectos avançados de implementação | 670 KB |
| **Parte 08** | `Parte08.pdf` | **Processamento Multimodal Avançado**<br/>OCR, CLIP, processamento de vídeo (maior documento: 1.8 MB) | 1.8 MB |
| **Parte 09** | `Parte09.pdf` | **Sistemas de Memória e RAG**<br/>Vector stores, índices, busca híbrida | 1.1 MB |
| **Parte 10** | `Parte10.pdf` | **Agentes e Ferramentas**<br/>ReAct engine, tool calling, sandbox execution | 883 KB |
| **Parte 11** | `Parte11.pdf` | **Treinamento e Fine-tuning**<br/>LoRA, QLoRA, RLHF, PPO implementation | 972 KB |
| **Parte 12** | `Parte12.pdf` | **Otimização e Performance**<br/>Quantização, caching, distributed inference | 660 KB |
| **Parte 13** | `Parte13.pdf` | **Segurança e Políticas**<br/>Content moderation, policy enforcement, audit logging | 630 KB |
| **Parte 14** | `Parte14.pdf` | **Monitoramento e Observabilidade**<br/>Metrics, logging, Prometheus integration | 542 KB |
| **Parte 15** | `Parte15.pdf` | **Deploy e Infraestrutura**<br/>Production deployment, scaling, monitoring | 395 KB |
| **Parte 16** | `Parte16.pdf` | **Casos de Uso e Exemplos**<br/>Real-world applications, best practices, troubleshooting | 363 KB |

## 📊 Estatísticas

- **Total de PDFs**: 19 documentos
- **Tamanho Total**: ~12 MB
- **Maior documento**: Parte 08 (Processamento Multimodal - 1.8 MB)
- **Idioma**: Português do Brasil (pt-BR)

## 🎯 Guia de Leitura Recomendado

### Para Entender os Fundamentos
1. **Parte 01** - Fundamentos teóricos (Transformer, MoE, LoRA)
2. **Parte 02** - Visão geral da arquitetura do sistema
3. **Parte 04** - Apêndices matemáticos (opcional, para detalhes técnicos profundos)

### Para Implementação
1. **Partes 03.1 a 03.4** - Arquitetura detalhada do sistema
2. **Partes 05 a 07** - Implementação prática passo a passo
3. **Parte 15** - Deploy e infraestrutura

### Para Recursos Específicos
- **Multimodal**: Partes 03.2, 08
- **RAG/Conhecimento**: Partes 02, 09
- **Agentes Autônomos**: Partes 03.3, 10
- **Treinamento/LoRA**: Parte 11
- **Políticas/Segurança**: Parte 13
- **Deploy**: Partes 03.4, 15

### Para Casos de Uso
- **Parte 16** - Exemplos práticos e troubleshooting

## 🔗 Links Relacionados

- [Arquitetura do Sistema](./ARCHITECTURE.md) - Visão técnica da implementação
- [Sistema de Fallback Automático](./AUTOMATIC_FALLBACK.md) - Novo sistema de fallback
- [Referência da API](./API.md) - Endpoints REST
- [README Principal](../README.md) - Visão geral do projeto

## 📝 Notas

- Os PDFs contêm a documentação técnica completa do sistema AION
- Incluem fundamentação matemática, arquitetura, implementação e deploy
- Escritos para desenvolvedores e pesquisadores de IA
- Todos os conceitos do sistema implementado estão documentados nesses PDFs
