# 📚 GUIA COMPLETO - Sistema Multi-Agentes AION

## 🎯 O que é o Sistema Multi-Agentes?

O Sistema Multi-Agentes do AION funciona como uma **equipe inteligente** onde cada agente é um especialista em diferentes áreas. Quando você faz uma pergunta, o sistema automaticamente escolhe o(s) melhor(es) agente(s) para responder.

---

## 🤖 Como Funciona Automaticamente?

### 1. **Você Envia uma Mensagem**
```
Exemplo: "Como investir em ações?"
```

### 2. **Router MoE (Mixture of Experts) Analisa**
O sistema usa um LLM para:
- Ler sua pergunta
- Analisar todos os agentes disponíveis
- Dar uma pontuação de 0-100 para cada agente
- Selecionar os mais adequados (até 2 agentes podem trabalhar juntos)

```
Análise:
- Agente Finanças: 95 pontos → SELECIONADO! ✅
- Agente Tech: 20 pontos → Não selecionado
- Assistente AION: 30 pontos → Não selecionado
```

### 3. **Agente Responde**
O agente selecionado usa:
- Seu **System Prompt** (instruções de comportamento)
- Seus **RAG Namespaces** (conhecimento específico)
- Suas **Tools** (ferramentas permitidas)

### 4. **Resposta Vai para Curadoria (HITL)**
🚨 **IMPORTANTE**: Todas as conversas passam pela fila de curadoria antes de virarem conhecimento oficial!

---

## 📊 Tipos de Agentes

### **1. GENERALIST** (Generalista)
- **Quando usar**: Conversas gerais, cumprimentos, perguntas variadas
- **Exemplo**: "Assistente AION"
- **Características**: 
  - Amplo conhecimento
  - Bom para conversas casuais
  - Pode encaminhar para especialistas

### **2. SPECIALIST** (Especialista)
- **Quando usar**: Perguntas específicas de uma área
- **Exemplos**: 
  - "Agente Finanças" → investimentos, contabilidade
  - "Agente Tech" → programação, arquitetura
  - "Agente Marketing" → SEO, branding
- **Características**:
  - Conhecimento profundo em área específica
  - Acesso a namespaces especializados
  - Ferramentas específicas do domínio

---

## 🗂️ O que são Namespaces?

Namespaces são **pastas de conhecimento**. Cada agente tem acesso a namespaces específicos.

### Estrutura Hierárquica:
```
kb/                    (namespace raiz - conhecimento geral)
├── kb/tecnologia     (subnamespace - tecnologia)
├── kb/financas       (subnamespace - finanças)
└── kb/marketing      (subnamespace - marketing)

empresa-x/            (namespace raiz - empresa específica)
├── empresa-x/vendas
├── empresa-x/rh
└── empresa-x/docs
```

### Como Funcionam:
- **Agente Tech** tem acesso a: `["kb/tecnologia", "code/*", "architecture/*"]`
- Quando você pergunta algo técnico, ele busca APENAS nesses namespaces
- Isso deixa as respostas mais precisas e relevantes

---

## ⚙️ Como Criar um Agente - PASSO A PASSO

### **PASSO 1: Criar Namespaces Primeiro**

1. Vá em: **Admin → Namespaces**
2. Clique em **"Criar Namespace"**
3. Exemplo para Agente de Curadoria:
   ```
   Nome: curadoria
   Descrição: Conhecimento sobre processo de curadoria HITL
   ```

4. Crie subnamespaces se necessário:
   ```
   curadoria/docs         (documentação)
   curadoria/procedures   (procedimentos)
   curadoria/quality      (critérios de qualidade)
   ```

### **PASSO 2: Criar o Agente**

1. Vá em: **Admin → Agentes Especialistas → aba "Criar Agente"**

2. Preencha:
   ```
   Nome do Agente: Agente de Curadoria
   
   Namespace Raiz: curadoria
   (Selecione da lista - agora vai aparecer!)
   
   Descrição: 
   Especialista em revisar conteúdo e garantir qualidade
   antes de indexar na base de conhecimento
   
   System Prompt:
   Você é um curador especializado em avaliar qualidade de 
   conteúdo. Analise documentos quanto a:
   - Relevância
   - Precisão
   - Completude
   - Qualidade da escrita
   Sugira melhorias e classificações adequadas.
   ```

3. **Namespaces RAG** (conhecimento que o agente pode acessar):
   - Se aparecer vazio, é porque não há namespaces criados ainda!
   - Solução: Crie namespaces primeiro (Passo 1)
   - Depois selecione: `["curadoria/*"]` para acessar todos

---

## 🔍 Por que Namespaces não Aparecem?

### Problema Comum:
Quando você vai criar um agente e a lista de namespaces está vazia.

### Causa:
O sistema busca namespaces do banco de dados. Se não há namespaces criados, a lista fica vazia!

### Solução:
```
1. Admin → Namespaces
2. Criar pelo menos 1 namespace
3. Voltar para Admin → Agentes
4. Agora a lista vai mostrar os namespaces! ✅
```

---

## 💬 Sistema de Curadoria (HITL)

### O que é HITL?
**Human-In-The-Loop** = Humano no Circuito

### Como Funciona:
```
1. Usuário conversa no chat
   ↓
2. IA responde usando agentes
   ↓
3. Conversa vai para FILA DE CURADORIA ⏸️
   ↓
4. Humano revisa e aprova
   ↓
5. SÓ ENTÃO vai para a Base de Conhecimento ✅
```

### Por que é Importante?
- ❌ **SEM HITL**: Qualquer conteúdo (até erros) vira conhecimento oficial
- ✅ **COM HITL**: Apenas conteúdo revisado e aprovado entra na KB

---

## 🎬 Exemplo Prático Completo

### Cenário: Criar Agente de Vendas

#### 1. **Criar Namespaces:**
```
vendas                  (namespace raiz)
vendas/produtos         (catálogo de produtos)
vendas/procedures       (processos de venda)
vendas/faq             (perguntas frequentes)
```

#### 2. **Criar Agente:**
```
Nome: Agente de Vendas
Tipo: specialist
Namespace Raiz: vendas

Descrição:
Especialista em atendimento comercial e vendas

System Prompt:
Você é um vendedor experiente. Ajude clientes a:
- Encontrar produtos adequados
- Entender especificações
- Finalizar compras
- Resolver dúvidas pré-venda
Seja empático, persuasivo e focado em conversão.

RAG Namespaces:
["vendas/*", "kb/geral"]

Tools Permitidas:
- web_search (buscar informações atualizadas)
- catalog (consultar catálogo de produtos)
```

#### 3. **Testar:**
```
Usuário: "Qual o melhor notebook para design gráfico?"

Sistema:
1. Router analisa a pergunta
2. Seleciona "Agente de Vendas" (pontuação: 92)
3. Agente busca em namespaces: vendas/produtos, vendas/faq
4. Responde com recomendações
5. Conversa vai para curadoria
6. Administrador aprova
7. Conhecimento indexado na KB
```

---

## ❓ Perguntas Frequentes

### **Q: Preciso criar namespace específico para cada agente?**
**A:** Não obrigatório, mas RECOMENDADO para organização:
- ✅ Melhor: Cada agente tem namespaces dedicados
- ⚠️ Funciona: Vários agentes compartilham os mesmos namespaces

### **Q: Posso dar todos os namespaces para um agente?**
**A:** Tecnicamente SIM (usando `["*"]`), mas não é recomendado:
- ❌ Agente fica confuso com muito conhecimento
- ❌ Respostas ficam genéricas
- ✅ Melhor: Namespaces específicos = respostas precisas

### **Q: Como saber qual agente respondeu?**
**A:** O sistema escolhe automaticamente. Você pode ver nos logs do servidor qual agente foi selecionado.

### **Q: Por que minhas mensagens não aparecem na curadoria?**
**A:** Possíveis causas:
1. Sistema está desabilitado (verificar logs)
2. Erro silencioso no backend
3. Conversa não atendeu critérios mínimos de qualidade

---

## 🚀 Primeiros Passos Recomendados

### 1. **Criar Namespaces Básicos**
```
kb/geral              (conhecimento geral)
kb/tecnologia         (tech)
kb/negocios          (business)
procedimentos/atendimento
procedimentos/operacional
```

### 2. **Criar Agentes Essenciais**
- ✅ 1 Generalista (já existe: Assistente AION)
- ✅ 2-3 Especialistas conforme necessidade

### 3. **Testar o Sistema**
- Envie perguntas variadas no chat
- Observe qual agente responde (logs do servidor)
- Verifique curadoria

### 4. **Refinar Gradualmente**
- Ajuste System Prompts
- Adicione/remova namespaces
- Crie novos agentes conforme necessário

---

## 🎓 Conceitos Avançados

### **Sub-Agentes**
Agentes podem ter sub-agentes (hierarquia):
```
Agente Vendas (coordenador)
├── Sub-Agente Pré-Venda
├── Sub-Agente Pós-Venda
└── Sub-Agente Suporte Técnico
```

### **Budget Limits**
Cada agente pode ter limite de custo por requisição:
```
perRequestBudgetUSD: 0.02  (máximo $0.02 por resposta)
```

### **Escalation Rules**
Agente pode escalar para humano se:
- Confiança baixa (< 60%)
- Sentimento negativo detectado
- Solicitação fora do escopo

---

## 📝 Checklist de Configuração

- [ ] Namespaces criados
- [ ] Pelo menos 1 agente generalista
- [ ] Pelo menos 2 agentes especialistas
- [ ] System Prompts bem definidos
- [ ] RAG Namespaces configurados
- [ ] Tools permitidas definidas
- [ ] Curadoria ativa
- [ ] Testes realizados

---

## 🆘 Troubleshooting

### Problema: "Namespace raiz obrigatório"
**Solução**: Crie um namespace raiz primeiro (sem "/")

### Problema: "Nenhum namespace disponível"
**Solução**: Vá em Admin → Namespaces e crie pelo menos 1

### Problema: "Agente não responde corretamente"
**Solução**: 
1. Revise o System Prompt
2. Verifique se tem namespaces atribuídos
3. Confirme que há conhecimento indexado nesses namespaces

### Problema: "Sempre seleciona o mesmo agente"
**Solução**:
1. Crie agentes com descrições mais específicas
2. Atribua namespaces bem distintos
3. Refine os System Prompts para serem mais focados

---

## 🎯 Conclusão

O Sistema Multi-Agentes é PODEROSO mas requer configuração inicial:

1. **Crie namespaces** (estrutura de conhecimento)
2. **Crie agentes** (especialistas em cada área)
3. **Configure bem** (prompts, namespaces, tools)
4. **Teste e refine** (ajuste conforme feedback)

**Lembre-se**: 
- ✅ Sistema seleciona agente automaticamente
- ✅ Curadoria garante qualidade
- ✅ Namespaces organizam conhecimento
- ✅ Cada agente é um especialista focado

---

**Dúvidas?** Consulte os logs do servidor ou faça testes práticos! 🚀
