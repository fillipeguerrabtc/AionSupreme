# 🔥 Guia Completo - Google Colab Keepalive (Atualizado 2025)

## ⏱️ **Limitações do Google Colab FREE**

| **Limite** | **Valor** | **Contornável?** |
|-----------|----------|-----------------|
| **Timeout de inatividade** | ~90 minutos | ✅ **SIM** (JavaScript keepalive) |
| **Limite absoluto de tempo** | 12 horas (FREE) / 24h (Pro) | ❌ **NÃO** |
| **CAPTCHAs aleatórios** | Imprevisível | ⚠️ Manual (5 segundos) |
| **Mudança de UI** | Raro | ✅ Script com fallbacks |

---

## 🚀 **MÉTODO RECOMENDADO: JavaScript Console (Múltiplos Fallbacks)**

### **Passo 1: Abrir Console do Navegador**

**Windows/Linux:**
- Pressione `Ctrl + Shift + I`
- Clique na aba **Console**

**Mac:**
- Pressione `Option + Command + I`
- Clique na aba **Console**

### **Passo 2: Colar Script com Fallbacks Múltiplos**

```javascript
// ============================================================================
// COLAB KEEPALIVE - Multi-Selector Fallback System (2025)
// ============================================================================

(function() {
  console.log('🔥 AION Colab Keepalive iniciado!');
  console.log('⏰ Clicando botão a cada 60 segundos...');
  console.log('⚠️ Mantenha esta aba VISÍVEL (não minimizada) para melhor funcionamento');
  
  let clickCount = 0;
  let lastClickTime = Date.now();
  
  // Lista de seletores em ordem de prioridade (do mais novo para mais antigo)
  const CONNECT_SELECTORS = [
    // Seletor atual (Novembro 2025)
    '#top-toolbar > colab-connect-button',
    'colab-connect-button',
    
    // Fallbacks históricos (caso UI mude)
    'colab-toolbar-button#connect',
    '#connect',
    '[data-test-id="colab-connect-button"]',
    'button[aria-label*="Connect"]',
    'button[aria-label*="Conectar"]',
  ];
  
  function findConnectButton() {
    for (const selector of CONNECT_SELECTORS) {
      try {
        let elem = document.querySelector(selector);
        
        // Se elemento tem shadowRoot, tentar acessar botão dentro dele
        if (elem && elem.shadowRoot) {
          const shadowBtn = elem.shadowRoot.querySelector('#connect') || 
                           elem.shadowRoot.querySelector('button');
          if (shadowBtn) {
            return shadowBtn;
          }
        }
        
        // Retornar elemento direto se encontrado
        if (elem) {
          return elem;
        }
      } catch (e) {
        // Continuar tentando próximo seletor
      }
    }
    return null;
  }
  
  function clickConnect() {
    const now = Date.now();
    const elapsed = Math.floor((now - lastClickTime) / 1000);
    
    const btn = findConnectButton();
    
    if (btn) {
      try {
        btn.click();
        clickCount++;
        lastClickTime = now;
        
        console.log(`✅ Click #${clickCount} executado (${elapsed}s desde último)`);
        console.log(`⏱️ Sessão ativa há ${Math.floor(clickCount * 60 / 60)} minutos`);
      } catch (e) {
        console.warn('⚠️ Erro ao clicar botão:', e.message);
      }
    } else {
      console.warn('⚠️ Botão de conexão não encontrado - todos seletores falharam');
      console.warn('💡 Possível atualização da UI do Colab - reportar ao time AION');
    }
  }
  
  // Executar imediatamente na primeira vez
  clickConnect();
  
  // Repetir a cada 60 segundos (60000ms)
  const intervalId = setInterval(clickConnect, 60000);
  
  // Armazenar ID do interval globalmente para poder parar depois
  window.AION_KEEPALIVE_INTERVAL = intervalId;
  
  console.log('━'.repeat(60));
  console.log('✅ Keepalive ativo! Para PARAR, execute:');
  console.log('   clearInterval(window.AION_KEEPALIVE_INTERVAL);');
  console.log('━'.repeat(60));
})();
```

### **Passo 3: Pressionar Enter**

O script começará a rodar automaticamente.

### **Passo 4: Verificar Funcionamento**

Você verá no console:
```
✅ Click #1 executado (0s desde último)
⏱️ Sessão ativa há 1 minutos
✅ Click #2 executado (60s desde último)
⏱️ Sessão ativa há 2 minutos
...
```

### **Passo 5: Manter Aba Visível**

⚠️ **IMPORTANTE:** Navegadores reduzem prioridade de abas em background.
- ✅ Mantenha aba do Colab **visível** (não minimizada)
- ✅ Pode trabalhar em outras abas, mas volte periodicamente
- ❌ **NÃO minimize** o navegador completamente

---

## 🛑 **Como PARAR o Keepalive**

Quando quiser desligar o keepalive:

```javascript
clearInterval(window.AION_KEEPALIVE_INTERVAL);
console.log('🛑 Keepalive PARADO');
```

---

## 🤖 **MÉTODO ALTERNATIVO: Python In-Notebook**

Execute esta célula **no próprio Colab notebook:**

```python
from IPython.display import Javascript
import IPython

display(IPython.display.Javascript('''
(function() {
  console.log('🔥 AION Keepalive (Python) iniciado!');
  
  let clickCount = 0;
  
  function clickConnect() {
    const selectors = [
      '#top-toolbar > colab-connect-button',
      'colab-connect-button'
    ];
    
    for (const sel of selectors) {
      try {
        let elem = document.querySelector(sel);
        if (elem && elem.shadowRoot) {
          const btn = elem.shadowRoot.querySelector('#connect');
          if (btn) {
            btn.click();
            clickCount++;
            console.log(`✅ Click #${clickCount} via Python`);
            return;
          }
        }
      } catch (e) {}
    }
    console.warn('⚠️ Botão não encontrado');
  }
  
  setInterval(clickConnect, 60000);
  clickConnect(); // Primeira execução
})();
'''))

print("✅ Keepalive ativo via Python!")
print("⚠️ Mantenha esta célula executada")
```

---

## 🔌 **MÉTODO 3: Extensão Chrome (Mais Fácil)**

1. Instalar extensão: [Colab Keep-Alive](https://chromewebstore.google.com/detail/google-colab-keep-alive/bokldcdphgknojlbfhpbbgkggjfhhaek)
2. Ativar extensão quando abrir Colab
3. **Pronto!** Auto-clica a cada 60s

⚠️ **Mesmas limitações** (12h, CAPTCHAs)

---

## ⚠️ **LIMITAÇÕES E AVISOS**

### **1. Limite Absoluto de 12 Horas (FREE)**

- ❌ **NÃO HÁ COMO CONTORNAR**
- Após 12h, sessão DESCONECTA automaticamente
- Solução: Reabrir notebook e executar novamente

### **2. CAPTCHAs Aleatórios**

Google pode mostrar CAPTCHA "Are you a robot?" **a qualquer momento**.

**Quando aparecer:**
1. ✅ Clique no CAPTCHA (5 segundos)
2. ✅ Sessão continua normalmente
3. ✅ Keepalive continua funcionando

**Frequência:** Imprevisível (pode nunca aparecer ou aparecer 2x em 12h)

### **3. Seletores DOM Podem Quebrar**

- Google atualiza UI do Colab periodicamente
- Script tem **7 fallbacks** para lidar com isso
- Se TODOS falharem: Atualizar script com novo seletor

**Como identificar novo seletor (se necessário):**
1. Abrir DevTools (F12)
2. Inspecionar botão "Connect"
3. Copiar seletor CSS
4. Adicionar à lista `CONNECT_SELECTORS`

---

## 📊 **Fluxo Típico de 1 Dia de Uso**

| **Hora** | **Ação** | **Status** |
|---------|---------|-----------|
| 08:00 | Abrir 7 notebooks Colab | Manual (5 min) |
| 08:05 | Colar keepalive JavaScript | Manual (7 cliques) |
| 08:06 | Workers registrados e ativos | ✅ Automático |
| 08:06 - 20:00 | Sessão ativa, aguardando jobs | ✅ Automático |
| 12:00 | CAPTCHA aparece (raro) | Manual (5 seg) |
| 15:30 | Job de treino chega | ✅ Automático |
| 17:00 | Treino completa, worker desliga | ✅ Automático |
| 20:06 | Limite 12h atingido → desconecta | ❌ Inevitável |
| **PRÓXIMO DIA** | Repetir processo | Manual (5 min) |

**Tempo manual total:** ~5-10 minutos por dia

---

## 🎯 **RECOMENDAÇÕES DE USO**

### ✅ **Boas Práticas:**
- Use para treinos legítimos (não abuse dos recursos gratuitos)
- Feche sessões quando não estiver usando
- Monte Google Drive para salvar checkpoints automaticamente
- Monitore logs no AION dashboard

### ❌ **NÃO Faça:**
- Deixar GPUs ociosas desnecessariamente
- Usar para mineração de criptomoedas (ban permanente)
- Tentar contornar limite de 12h (impossível e contra ToS)

---

## 🐛 **Troubleshooting**

### **Problema: "Botão não encontrado"**

```
⚠️ Botão de conexão não encontrado - todos seletores falharam
```

**Solução:**
1. Verificar se você está na página do Colab (não Google Drive)
2. Atualizar página e tentar novamente
3. Se persistir: Google pode ter atualizado UI (reportar ao time)

### **Problema: Sessão desconecta mesmo com keepalive**

**Possíveis causas:**
1. Atingiu limite de 12h (inevitável)
2. Aba estava minimizada (navegador pausou JavaScript)
3. Google detectou uso excessivo (ban temporário de GPU)

**Solução:**
- Verificar quanto tempo sessão estava ativa
- Manter aba visível
- Aguardar 24h se ban de GPU

### **Problema: Script não aparece rodando**

**Verificar:**
1. Console está aberto e visível?
2. Executou o script (pressionou Enter)?
3. Nenhum erro de sintaxe no console?

---

## 📚 **Recursos Adicionais**

- [FAQ Oficial Colab](https://research.google.com/colaboratory/faq.html)
- [Stack Overflow - Colab Keepalive](https://stackoverflow.com/questions/57113226/how-can-i-prevent-google-colab-from-disconnecting)
- [GitHub Gist - Exemplos](https://gist.github.com/pouyaardehkhani/29a59270801a209d4960e2aefe648bbc)

---

**Última atualização:** Novembro 2025  
**Testado em:** Chrome 120+, Firefox 121+, Edge 120+  
**Status:** ✅ Funcionando
