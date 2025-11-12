# Dataset Source Whitelist

## Visão Geral
Este documento define **TODAS** as fontes de dados elegíveis para treinamento automático do sistema AION.

## ⚠️ REGRA CRÍTICA
Apenas itens com `status='indexed'` **E** `source` nesta whitelist são usados para gerar datasets de treinamento.

## ✅ Fontes Aprovadas (10 tipos)

### 1. Ingestão Manual
- **Source ID**: `manual`
- **Descrição**: Conteúdo digitado manualmente pelo admin na KB
- **Qualidade**: ALTA (curado por humano)
- **Uso**: Treinamento base

### 2. Upload de Arquivos
- **Source ID**: `upload`
- **Descrição**: PDFs, DOCXs, Excel, etc. enviados via interface
- **Qualidade**: ALTA (validado na entrada)
- **Uso**: Conhecimento estruturado

### 3. URLs Inseridas
- **Source ID**: `url`
- **Descrição**: Links inseridos manualmente pelo usuário
- **Qualidade**: MÉDIA-ALTA (validado por scraping)
- **Uso**: Conhecimento externo

### 4. Web Search (DuckDuckGo)
- **Source ID**: `web-search`
- **Descrição**: Resultados de busca web automatizada
- **Qualidade**: MÉDIA (validado por relevância)
- **Uso**: Conhecimento atualizado

### 5. YouTube Transcripts
- **Source ID**: `youtube`
- **Descrição**: Transcrições de vídeos do YouTube
- **Qualidade**: MÉDIA (depende do vídeo)
- **Uso**: Conhecimento audiovisual

### 6. Curadoria Aprovada
- **Source ID**: `curation_approved`
- **Descrição**: Itens aprovados via fila de curadoria HITL
- **Qualidade**: MUITO ALTA (double-check humano)
- **Uso**: Conhecimento premium

### 7. Absorção de Curadoria
- **Source ID**: `curation_absorption`
- **Descrição**: Itens absorvidos (merged) durante curadoria
- **Qualidade**: ALTA (consolidado)
- **Uso**: Deduplicação semântica

### 8. Chat Ingestion
- **Source ID**: `chat_ingestion`
- **Descrição**: Conversas de qualidade coletadas automaticamente
- **Qualidade**: MÉDIA (filtrado por score)
- **Uso**: Aprendizado contínuo

### 9. Link Ingestion
- **Source ID**: `link_ingestion`
- **Descrição**: Links capturados de conversas (background worker)
- **Qualidade**: MÉDIA (validado por scraping)
- **Uso**: Expansão de conhecimento

### 10. Bulk Import
- **Source ID**: `bulk_import`
- **Descrição**: Importações em lote via API
- **Qualidade**: ALTA (validado na entrada)
- **Uso**: Migração de dados

## ❌ Fontes Excluídas

### Por que NÃO usamos synthetic/test/staged?

#### `synthetic`
- **Motivo**: Dados gerados artificialmente (sem informação real)
- **Risco**: Contaminar modelo com padrões artificiais
- **Exemplo**: Mock data, exemplos de teste

#### `test`
- **Motivo**: Dados de ambiente de teste/desenvolvimento
- **Risco**: Leakage de dados não-produção
- **Exemplo**: "teste123", "foo bar"

#### `staged`
- **Motivo**: Dados em preparação (ainda não validados)
- **Risco**: Inconsistências, qualidade não verificada
- **Exemplo**: Rascunhos, conteúdo pending review

#### `experimental`
- **Motivo**: Features experimentais (instáveis)
- **Risco**: Comportamentos não-testados
- **Exemplo**: Testes A/B, prototypes

## 🔄 Processo de Aprovação de Novas Fontes

### Quando adicionar nova source?
1. Novo canal de ingestão implementado
2. Integração com serviço externo
3. Migração de dados legados

### Passos obrigatórios:
1. **Validar qualidade** - Score mínimo, PII redaction, etc
2. **Adicionar na whitelist** - `server/training/dataset-generator.ts`
3. **Atualizar este documento** - Documentar nova fonte
4. **Testar filtro** - Verificar que apenas dados qualificados entram

### Código (dataset-generator.ts):
```typescript
const PRODUCTION_SOURCES = [
  'upload', 'manual', 'url', 'web-search', 'youtube',
  'curation_approved', 'curation_absorption',
  'chat_ingestion', 'link_ingestion', 'bulk_import',
  // 'nova-fonte', // Adicionar aqui após validação
];
```

## 📊 Auditoria e Compliance

### GDPR & Privacy
- Todas as fontes passam por **PII Redaction** (10+ patterns)
- Threshold de 25 items previne memorização de indivíduos
- Replay buffer previne catastrophic forgetting

### Quality Gates
- **Min score**: 60/100 (configurável)
- **Min length**: validação de conteúdo não-vazio
- **Deduplication**: semantic similarity < 92%

### Logs de Auditoria
```bash
# Verificar fontes em uso:
grep "KB items prontos" logs/Start_application_*.log

# Contar por source:
SELECT source, COUNT(*) FROM documents 
WHERE status='indexed' 
GROUP BY source ORDER BY COUNT(*) DESC;
```

## 🚨 Troubleshooting

### "Por que meu item não está no dataset?"
1. Verificar `status='indexed'` no banco
2. Verificar se `source` está na whitelist
3. Verificar logs de quality gates

### "Como adicionar nova fonte?"
1. Seguir processo de aprovação acima
2. Testar em staging primeiro
3. Monitorar métricas de qualidade

---

**Última atualização**: 2025-11-12
**Maintainer**: AION Core Team
**Review**: Mensal (1º de cada mês)
