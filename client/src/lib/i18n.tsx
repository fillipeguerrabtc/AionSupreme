import { createContext, useContext, useState, ReactNode } from "react";

export type Language = "pt-BR" | "en-US" | "es-ES";

interface Translations {
  // Chat Interface
  chat: {
    welcome: string;
    welcomeDesc: string;
    placeholder: string;
    thinking: string;
    send: string;
    title: string;
    subtitle: string;
    newChat: string;
    conversations: string;
  };
  
  // Admin Dashboard
  admin: {
    title: string;
    subtitle: string;
    backToChat: string;
    
    // Main Tabs
    tabs: {
      overview: string;
      tokenMonitoring: string;
      history: string;
      costHistory: string;
      knowledgeBase: string;
      gpuManagement: string;
      federatedTraining: string;
    };
    
    // Overview Tab
    overview: {
      totalTokens: string;
      totalCost: string;
      kbSearches: string;
      freeApis: string;
      openai: string;
      webSearches: string;
      deepWeb: string;
      kbDocuments: string;
      allProviders: string;
      openaiOnly: string;
      knowledgeBaseQueries: string;
      groqGeminiHfOpenrouter: string;
      domainsSearched: string;
      torNetworkQueries: string;
      indexedKnowledge: string;
    };
    
    // Token Monitoring
    tokenMonitoring: {
      title: string;
      subtitle: string;
      kbSearches: string;
      freeApis: string;
      openai: string;
      webSearches: string;
      deepWebSearches: string;
      limitsAlerts: string;
      usageDistribution: string;
      distributionDesc: string;
    };
    
    // Knowledge Base
    knowledgeBase: {
      title: string;
      subtitle: string;
      addText: string;
      learnFromUrl: string;
      searchWeb: string;
      uploadFiles: string;
      storedKnowledge: string;
      manageAllKnowledge: string;
      source: string;
      provider: string;
      edit: string;
      delete: string;
    };
    
    // GPU Management
    gpuManagement: {
      title: string;
      subtitle: string;
      activeWorkers: string;
      totalRequests: string;
      avgLatency: string;
      errorRate: string;
      workersOnline: string;
      requestsProcessed: string;
      avgResponseTime: string;
      failedRequests: string;
      registeredWorkers: string;
      manageAllGpuWorkers: string;
      provider: string;
      model: string;
      gpu: string;
      status: string;
      health: string;
      requests: string;
      latency: string;
      actions: string;
      healthy: string;
      unhealthy: string;
      remove: string;
    };
    
    // Federated Training
    federatedTraining: {
      title: string;
      subtitle: string;
      createJob: string;
      activeJobs: string;
      totalWorkers: string;
      completedJobs: string;
      avgSpeed: string;
      jobsRunning: string;
      gpusActive: string;
      jobsFinished: string;
      speedupVsSingleGpu: string;
      trainingJobs: string;
      noJobsYet: string;
      createFirstJob: string;
      
      // Create Job Dialog
      createDialog: {
        title: string;
        description: string;
        jobName: string;
        jobNamePlaceholder: string;
        modelBase: string;
        numGpus: string;
        gpuRecommendation: string;
        learningRate: string;
        epochs: string;
        dataset: string;
        datasetComingSoon: string;
        datasetDesc: string;
        cancel: string;
        create: string;
        creating: string;
      };
      
      // Job Status
      jobStatus: {
        pending: string;
        running: string;
        completed: string;
        failed: string;
        paused: string;
      };
    };
    
    // Policies
    policies: {
      title: string;
      description: string;
      moralEthicalLegal: string;
      configureRestrictions: string;
      rules: {
        selfHarm: string;
        hateSpeech: string;
        illicitHowto: string;
        mildProfanity: string;
        minorViolence: string;
        explicitSexual: string;
        politicalExtremism: string;
      };
    };
    
    // Behavior
    behavior: {
      title: string;
      description: string;
      formality: string;
      creativity: string;
      systemPrompt: string;
      systemPromptDesc: string;
      systemPromptPlaceholder: string;
    };
    
    // Messages
    messages: {
      policyUpdated: string;
      pdfsIndexed: string;
      loading: string;
      error: string;
      jobCreated: string;
      jobCreatedDesc: string;
      jobCreateError: string;
      nameRequired: string;
      nameRequiredDesc: string;
    };
  };
}

const translations: Record<Language, Translations> = {
  "pt-BR": {
    chat: {
      welcome: "Bem-vindo ao AION",
      welcomeDesc: "Sistema de IA autônomo com capacidades ilimitadas. Pergunte qualquer coisa.",
      placeholder: "Digite sua mensagem...",
      thinking: "Pensando...",
      send: "Enviar",
      title: "AION",
      subtitle: "IA Suprema & Ilimitada",
      newChat: "Nova Conversa",
      conversations: "Conversas",
    },
    admin: {
      title: "AION Admin",
      subtitle: "Painel de Controle & Políticas",
      backToChat: "Voltar ao Chat",
      
      tabs: {
        overview: "Visão Geral",
        tokenMonitoring: "Monitoramento de Tokens",
        history: "Histórico",
        costHistory: "Histórico de Custos",
        knowledgeBase: "Base de Conhecimento",
        gpuManagement: "Gerenciamento de GPUs",
        federatedTraining: "Treinamento Federado",
      },
      
      overview: {
        totalTokens: "Total de Tokens",
        totalCost: "Custo Total",
        kbSearches: "Buscas na KB",
        freeApis: "APIs Gratuitas",
        openai: "OpenAI",
        webSearches: "Buscas Web",
        deepWeb: "DeepWeb",
        kbDocuments: "Documentos KB",
        allProviders: "Todos provedores",
        openaiOnly: "Apenas OpenAI",
        knowledgeBaseQueries: "Consultas Knowledge Base",
        groqGeminiHfOpenrouter: "Groq, Gemini, HF, OpenRouter",
        domainsSearched: "domínios pesquisados",
        torNetworkQueries: "consultas rede Tor",
        indexedKnowledge: "conhecimento indexado",
      },
      
      tokenMonitoring: {
        title: "Monitoramento de Tokens",
        subtitle: "Rastreie o uso de tokens em tempo real",
        kbSearches: "Buscas KB",
        freeApis: "APIs Gratuitas",
        openai: "OpenAI",
        webSearches: "Buscas Web",
        deepWebSearches: "Buscas DeepWeb",
        limitsAlerts: "Limites & Alertas",
        usageDistribution: "Distribuição de Uso por Provedor",
        distributionDesc: "Consumo de tokens em todos os provedores",
      },
      
      knowledgeBase: {
        title: "Base de Conhecimento",
        subtitle: "Gerencie todos os conhecimentos indexados",
        addText: "Adicionar Texto",
        learnFromUrl: "Aprender de Link",
        searchWeb: "Pesquisar Web",
        uploadFiles: "Upload Arquivo(s)",
        storedKnowledge: "Conhecimentos Armazenados",
        manageAllKnowledge: "Gerenciar todos os conhecimentos da Knowledge Base",
        source: "Fonte",
        provider: "Provedor",
        edit: "Editar",
        delete: "Excluir",
      },
      
      gpuManagement: {
        title: "Gerenciamento de GPUs",
        subtitle: "Gerencie workers de GPU e load balancing",
        activeWorkers: "Workers Ativos",
        totalRequests: "Total de Requisições",
        avgLatency: "Latência Média",
        errorRate: "Taxa de Erros",
        workersOnline: "workers online",
        requestsProcessed: "requisições processadas",
        avgResponseTime: "tempo médio de resposta",
        failedRequests: "requisições falhadas",
        registeredWorkers: "Workers Registrados",
        manageAllGpuWorkers: "Gerencie todos os workers de GPU",
        provider: "Provedor",
        model: "Modelo",
        gpu: "GPU",
        status: "Status",
        health: "Saúde",
        requests: "Requisições",
        latency: "Latência",
        actions: "Ações",
        healthy: "Saudável",
        unhealthy: "Não Saudável",
        remove: "Remover",
      },
      
      federatedTraining: {
        title: "Treinamento Federado",
        subtitle: "Treine LLMs 3-4x mais rápido usando GPUs distribuídas",
        createJob: "Criar Training Job",
        activeJobs: "Jobs Ativos",
        totalWorkers: "Total de Workers",
        completedJobs: "Jobs Concluídos",
        avgSpeed: "Velocidade Média",
        jobsRunning: "jobs em execução",
        gpusActive: "GPUs ativas",
        jobsFinished: "jobs finalizados",
        speedupVsSingleGpu: "vs GPU única",
        trainingJobs: "Training Jobs",
        noJobsYet: "Nenhum training job ainda",
        createFirstJob: "Crie seu primeiro training job federado para começar",
        
        createDialog: {
          title: "Criar Federated Training Job",
          description: "Configure os parâmetros para treinar seu modelo customizado em múltiplas GPUs",
          jobName: "Nome do Job",
          jobNamePlaceholder: "Ex: Llama-3-Finetuned-Portuguese",
          modelBase: "Modelo Base",
          numGpus: "Número de GPUs (Chunks)",
          gpuRecommendation: "3-6 GPUs recomendado (Colab + Kaggle)",
          learningRate: "Learning Rate",
          epochs: "Epochs",
          dataset: "Dataset (Em Breve)",
          datasetComingSoon: "Dataset (Em Breve)",
          datasetDesc: "Por enquanto, o script Python usará dados de exemplo. Upload de dataset customizado será implementado em breve.",
          cancel: "Cancelar",
          create: "Criar Job",
          creating: "Criando...",
        },
        
        jobStatus: {
          pending: "Pendente",
          running: "Em Execução",
          completed: "Concluído",
          failed: "Falhou",
          paused: "Pausado",
        },
      },
      
      policies: {
        title: "Políticas",
        description: "Configure restrições de conteúdo",
        moralEthicalLegal: "Políticas Moral/Ética/Legal",
        configureRestrictions: "Configure restrições de conteúdo (sistema nasce 100% livre)",
        rules: {
          selfHarm: "Auto-Lesão",
          hateSpeech: "Discurso de Ódio",
          illicitHowto: "Atividades Ilícitas",
          mildProfanity: "Linguagem Imprópria",
          minorViolence: "Violência Menor",
          explicitSexual: "Conteúdo Sexual Explícito",
          politicalExtremism: "Extremismo Político",
        },
      },
      
      behavior: {
        title: "Comportamento da IA",
        description: "Ajuste a personalidade e estilo de resposta",
        formality: "Formalidade",
        creativity: "Criatividade",
        systemPrompt: "System Prompt",
        systemPromptDesc: "Instruções base para o comportamento da IA",
        systemPromptPlaceholder: "Digite o system prompt...",
      },
      
      messages: {
        policyUpdated: "Política atualizada com sucesso!",
        pdfsIndexed: "PDFs indexados com sucesso!",
        loading: "Carregando painel administrativo...",
        error: "Erro ao carregar políticas",
        jobCreated: "Training job criado!",
        jobCreatedDesc: "Abra os notebooks Colab/Kaggle para começar o treinamento.",
        jobCreateError: "Erro ao criar job",
        nameRequired: "Nome obrigatório",
        nameRequiredDesc: "Insira um nome para o training job",
      },
    },
  },
  
  "en-US": {
    chat: {
      welcome: "Welcome to AION",
      welcomeDesc: "Autonomous AI system with unlimited capabilities. Ask anything.",
      placeholder: "Type your message...",
      thinking: "Thinking...",
      send: "Send",
      title: "AION",
      subtitle: "Supreme & Unlimited AI",
      newChat: "New Chat",
      conversations: "Conversations",
    },
    admin: {
      title: "AION Admin",
      subtitle: "Control Panel & Policies",
      backToChat: "Back to Chat",
      
      tabs: {
        overview: "Overview",
        tokenMonitoring: "Token Monitoring",
        history: "History",
        costHistory: "Cost History",
        knowledgeBase: "Knowledge Base",
        gpuManagement: "GPU Management",
        federatedTraining: "Federated Training",
      },
      
      overview: {
        totalTokens: "Total Tokens",
        totalCost: "Total Cost",
        kbSearches: "KB Searches",
        freeApis: "Free APIs",
        openai: "OpenAI",
        webSearches: "Web Searches",
        deepWeb: "DeepWeb",
        kbDocuments: "KB Documents",
        allProviders: "All providers",
        openaiOnly: "OpenAI only",
        knowledgeBaseQueries: "Knowledge Base queries",
        groqGeminiHfOpenrouter: "Groq, Gemini, HF, OpenRouter",
        domainsSearched: "domains searched",
        torNetworkQueries: "Tor network queries",
        indexedKnowledge: "indexed knowledge",
      },
      
      tokenMonitoring: {
        title: "Token Monitoring",
        subtitle: "Track token usage in real-time",
        kbSearches: "KB Searches",
        freeApis: "Free APIs",
        openai: "OpenAI",
        webSearches: "Web Searches",
        deepWebSearches: "DeepWeb Searches",
        limitsAlerts: "Limits & Alerts",
        usageDistribution: "Usage Distribution by Provider",
        distributionDesc: "Token consumption across all providers",
      },
      
      knowledgeBase: {
        title: "Knowledge Base",
        subtitle: "Manage all indexed knowledge",
        addText: "Add Text",
        learnFromUrl: "Learn from URL",
        searchWeb: "Search Web",
        uploadFiles: "Upload File(s)",
        storedKnowledge: "Stored Knowledge",
        manageAllKnowledge: "Manage all Knowledge Base knowledge",
        source: "Source",
        provider: "Provider",
        edit: "Edit",
        delete: "Delete",
      },
      
      gpuManagement: {
        title: "GPU Management",
        subtitle: "Manage GPU workers and load balancing",
        activeWorkers: "Active Workers",
        totalRequests: "Total Requests",
        avgLatency: "Avg Latency",
        errorRate: "Error Rate",
        workersOnline: "workers online",
        requestsProcessed: "requests processed",
        avgResponseTime: "avg response time",
        failedRequests: "failed requests",
        registeredWorkers: "Registered Workers",
        manageAllGpuWorkers: "Manage all GPU workers",
        provider: "Provider",
        model: "Model",
        gpu: "GPU",
        status: "Status",
        health: "Health",
        requests: "Requests",
        latency: "Latency",
        actions: "Actions",
        healthy: "Healthy",
        unhealthy: "Unhealthy",
        remove: "Remove",
      },
      
      federatedTraining: {
        title: "Federated Training",
        subtitle: "Train LLMs 3-4x faster using distributed multi-GPU training",
        createJob: "Create Training Job",
        activeJobs: "Active Jobs",
        totalWorkers: "Total Workers",
        completedJobs: "Completed Jobs",
        avgSpeed: "Avg Speed",
        jobsRunning: "jobs running",
        gpusActive: "GPUs active",
        jobsFinished: "jobs finished",
        speedupVsSingleGpu: "vs single GPU",
        trainingJobs: "Training Jobs",
        noJobsYet: "No training jobs yet",
        createFirstJob: "Create your first federated training job to get started",
        
        createDialog: {
          title: "Create Federated Training Job",
          description: "Configure parameters to train your custom model on multiple GPUs",
          jobName: "Job Name",
          jobNamePlaceholder: "Ex: Llama-3-Finetuned-Portuguese",
          modelBase: "Base Model",
          numGpus: "Number of GPUs (Chunks)",
          gpuRecommendation: "3-6 GPUs recommended (Colab + Kaggle)",
          learningRate: "Learning Rate",
          epochs: "Epochs",
          dataset: "Dataset (Coming Soon)",
          datasetComingSoon: "Dataset (Coming Soon)",
          datasetDesc: "For now, the Python script will use sample data. Custom dataset upload will be implemented soon.",
          cancel: "Cancel",
          create: "Create Job",
          creating: "Creating...",
        },
        
        jobStatus: {
          pending: "Pending",
          running: "Running",
          completed: "Completed",
          failed: "Failed",
          paused: "Paused",
        },
      },
      
      policies: {
        title: "Policies",
        description: "Configure content restrictions",
        moralEthicalLegal: "Moral/Ethical/Legal Policies",
        configureRestrictions: "Configure content restrictions (system born 100% free)",
        rules: {
          selfHarm: "Self-Harm",
          hateSpeech: "Hate Speech",
          illicitHowto: "Illicit Activities",
          mildProfanity: "Inappropriate Language",
          minorViolence: "Minor Violence",
          explicitSexual: "Explicit Sexual Content",
          politicalExtremism: "Political Extremism",
        },
      },
      
      behavior: {
        title: "AI Behavior",
        description: "Adjust personality and response style",
        formality: "Formality",
        creativity: "Creativity",
        systemPrompt: "System Prompt",
        systemPromptDesc: "Base instructions for AI behavior",
        systemPromptPlaceholder: "Enter system prompt...",
      },
      
      messages: {
        policyUpdated: "Policy updated successfully!",
        pdfsIndexed: "PDFs indexed successfully!",
        loading: "Loading admin panel...",
        error: "Error loading policies",
        jobCreated: "Training job created!",
        jobCreatedDesc: "Open Colab/Kaggle notebooks to start training.",
        jobCreateError: "Error creating job",
        nameRequired: "Name required",
        nameRequiredDesc: "Enter a name for the training job",
      },
    },
  },
  
  "es-ES": {
    chat: {
      welcome: "Bienvenido a AION",
      welcomeDesc: "Sistema de IA autónomo con capacidades ilimitadas. Pregunta cualquier cosa.",
      placeholder: "Escribe tu mensaje...",
      thinking: "Pensando...",
      send: "Enviar",
      title: "AION",
      subtitle: "IA Suprema e Ilimitada",
      newChat: "Nueva Conversación",
      conversations: "Conversaciones",
    },
    admin: {
      title: "AION Admin",
      subtitle: "Panel de Control y Políticas",
      backToChat: "Volver al Chat",
      
      tabs: {
        overview: "Resumen",
        tokenMonitoring: "Monitoreo de Tokens",
        history: "Historial",
        costHistory: "Historial de Costos",
        knowledgeBase: "Base de Conocimiento",
        gpuManagement: "Gestión de GPUs",
        federatedTraining: "Entrenamiento Federado",
      },
      
      overview: {
        totalTokens: "Total de Tokens",
        totalCost: "Costo Total",
        kbSearches: "Búsquedas KB",
        freeApis: "APIs Gratuitas",
        openai: "OpenAI",
        webSearches: "Búsquedas Web",
        deepWeb: "DeepWeb",
        kbDocuments: "Documentos KB",
        allProviders: "Todos los proveedores",
        openaiOnly: "Solo OpenAI",
        knowledgeBaseQueries: "consultas Base de Conocimiento",
        groqGeminiHfOpenrouter: "Groq, Gemini, HF, OpenRouter",
        domainsSearched: "dominios buscados",
        torNetworkQueries: "consultas red Tor",
        indexedKnowledge: "conocimiento indexado",
      },
      
      tokenMonitoring: {
        title: "Monitoreo de Tokens",
        subtitle: "Rastrea el uso de tokens en tiempo real",
        kbSearches: "Búsquedas KB",
        freeApis: "APIs Gratuitas",
        openai: "OpenAI",
        webSearches: "Búsquedas Web",
        deepWebSearches: "Búsquedas DeepWeb",
        limitsAlerts: "Límites y Alertas",
        usageDistribution: "Distribución de Uso por Proveedor",
        distributionDesc: "Consumo de tokens en todos los proveedores",
      },
      
      knowledgeBase: {
        title: "Base de Conocimiento",
        subtitle: "Gestiona todo el conocimiento indexado",
        addText: "Añadir Texto",
        learnFromUrl: "Aprender de URL",
        searchWeb: "Buscar Web",
        uploadFiles: "Subir Archivo(s)",
        storedKnowledge: "Conocimientos Almacenados",
        manageAllKnowledge: "Gestiona todo el conocimiento de la Base de Conocimiento",
        source: "Fuente",
        provider: "Proveedor",
        edit: "Editar",
        delete: "Eliminar",
      },
      
      gpuManagement: {
        title: "Gestión de GPUs",
        subtitle: "Gestiona workers de GPU y balanceo de carga",
        activeWorkers: "Workers Activos",
        totalRequests: "Total de Solicitudes",
        avgLatency: "Latencia Media",
        errorRate: "Tasa de Errores",
        workersOnline: "workers en línea",
        requestsProcessed: "solicitudes procesadas",
        avgResponseTime: "tiempo medio de respuesta",
        failedRequests: "solicitudes fallidas",
        registeredWorkers: "Workers Registrados",
        manageAllGpuWorkers: "Gestiona todos los workers de GPU",
        provider: "Proveedor",
        model: "Modelo",
        gpu: "GPU",
        status: "Estado",
        health: "Salud",
        requests: "Solicitudes",
        latency: "Latencia",
        actions: "Acciones",
        healthy: "Saludable",
        unhealthy: "No Saludable",
        remove: "Eliminar",
      },
      
      federatedTraining: {
        title: "Entrenamiento Federado",
        subtitle: "Entrena LLMs 3-4x más rápido usando GPUs distribuidas",
        createJob: "Crear Training Job",
        activeJobs: "Jobs Activos",
        totalWorkers: "Total de Workers",
        completedJobs: "Jobs Completados",
        avgSpeed: "Velocidad Media",
        jobsRunning: "jobs en ejecución",
        gpusActive: "GPUs activas",
        jobsFinished: "jobs finalizados",
        speedupVsSingleGpu: "vs GPU única",
        trainingJobs: "Training Jobs",
        noJobsYet: "Aún no hay training jobs",
        createFirstJob: "Crea tu primer training job federado para comenzar",
        
        createDialog: {
          title: "Crear Federated Training Job",
          description: "Configura los parámetros para entrenar tu modelo personalizado en múltiples GPUs",
          jobName: "Nombre del Job",
          jobNamePlaceholder: "Ej: Llama-3-Finetuned-Portuguese",
          modelBase: "Modelo Base",
          numGpus: "Número de GPUs (Chunks)",
          gpuRecommendation: "3-6 GPUs recomendado (Colab + Kaggle)",
          learningRate: "Learning Rate",
          epochs: "Epochs",
          dataset: "Dataset (Próximamente)",
          datasetComingSoon: "Dataset (Próximamente)",
          datasetDesc: "Por ahora, el script Python usará datos de ejemplo. La carga de dataset personalizado se implementará pronto.",
          cancel: "Cancelar",
          create: "Crear Job",
          creating: "Creando...",
        },
        
        jobStatus: {
          pending: "Pendiente",
          running: "En Ejecución",
          completed: "Completado",
          failed: "Fallido",
          paused: "Pausado",
        },
      },
      
      policies: {
        title: "Políticas",
        description: "Configura restricciones de contenido",
        moralEthicalLegal: "Políticas Moral/Ética/Legal",
        configureRestrictions: "Configura restricciones de contenido (sistema nace 100% libre)",
        rules: {
          selfHarm: "Autolesión",
          hateSpeech: "Discurso de Odio",
          illicitHowto: "Actividades Ilícitas",
          mildProfanity: "Lenguaje Inapropiado",
          minorViolence: "Violencia Menor",
          explicitSexual: "Contenido Sexual Explícito",
          politicalExtremism: "Extremismo Político",
        },
      },
      
      behavior: {
        title: "Comportamiento de la IA",
        description: "Ajusta la personalidad y estilo de respuesta",
        formality: "Formalidad",
        creativity: "Creatividad",
        systemPrompt: "System Prompt",
        systemPromptDesc: "Instrucciones base para el comportamiento de la IA",
        systemPromptPlaceholder: "Introduce el system prompt...",
      },
      
      messages: {
        policyUpdated: "¡Política actualizada con éxito!",
        pdfsIndexed: "¡PDFs indexados con éxito!",
        loading: "Cargando panel administrativo...",
        error: "Error al cargar políticas",
        jobCreated: "¡Training job creado!",
        jobCreatedDesc: "Abre los notebooks Colab/Kaggle para comenzar el entrenamiento.",
        jobCreateError: "Error al crear job",
        nameRequired: "Nombre obligatorio",
        nameRequiredDesc: "Introduce un nombre para el training job",
      },
    },
  },
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: Translations;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

function detectBrowserLanguage(): Language {
  const browserLang = navigator.language || navigator.languages?.[0] || "pt-BR";
  
  if (browserLang.startsWith("pt")) return "pt-BR";
  if (browserLang.startsWith("es")) return "es-ES";
  if (browserLang.startsWith("en")) return "en-US";
  
  // Default to Portuguese (Brazil)
  return "pt-BR";
}

/**
 * DUAL LANGUAGE DETECTION - Level 2: Realtime message analysis
 * Detects language from message content using common patterns
 */
export function detectMessageLanguage(text: string): Language | null {
  if (!text || text.trim().length < 10) return null;
  
  const lowerText = text.toLowerCase();
  
  // Portuguese patterns (common words and phrases)
  const ptPatterns = [
    /\b(o|a|os|as|um|uma|de|do|da|dos|das|para|por|com|sem|em|no|na)\b/g,
    /\b(que|quando|onde|como|porque|porquê|qual|quais)\b/g,
    /\b(eu|você|nós|eles|elas|meu|minha|seu|sua)\b/g,
    /\b(ser|estar|ter|fazer|ir|ver|poder|querer|dizer)\b/g,
    /\b(muito|pouco|bom|mau|grande|pequeno|novo|velho)\b/g,
    /\b(olá|obrigado|obrigada|por favor|desculpa|desculpe|tchau)\b/g,
    /ç|ã|õ|á|é|í|ó|ú|â|ê|ô/g,
  ];
  
  // Spanish patterns
  const esPatterns = [
    /\b(el|la|los|las|un|una|de|del|al|para|por|con|sin|en)\b/g,
    /\b(qué|cuándo|dónde|cómo|por qué|cuál|cuáles)\b/g,
    /\b(yo|tú|él|ella|nosotros|ellos|ellas|mi|tu|su)\b/g,
    /\b(ser|estar|tener|hacer|ir|ver|poder|querer|decir)\b/g,
    /\b(mucho|poco|bueno|malo|grande|pequeño|nuevo|viejo)\b/g,
    /\b(hola|gracias|por favor|perdón|adiós)\b/g,
    /ñ|á|é|í|ó|ú|¿|¡/g,
  ];
  
  // English patterns
  const enPatterns = [
    /\b(the|a|an|of|to|for|in|on|at|by|with|from|about)\b/g,
    /\b(what|when|where|how|why|which|who)\b/g,
    /\b(i|you|he|she|we|they|my|your|his|her|our|their)\b/g,
    /\b(is|are|was|were|be|being|been|have|has|had|do|does|did)\b/g,
    /\b(very|much|good|bad|big|small|new|old)\b/g,
    /\b(hello|hi|thanks|thank you|please|sorry|goodbye|bye)\b/g,
  ];
  
  // Count matches for each language
  const ptScore = ptPatterns.reduce((sum, pattern) => {
    const matches = lowerText.match(pattern);
    return sum + (matches ? matches.length : 0);
  }, 0);
  
  const esScore = esPatterns.reduce((sum, pattern) => {
    const matches = lowerText.match(pattern);
    return sum + (matches ? matches.length : 0);
  }, 0);
  
  const enScore = enPatterns.reduce((sum, pattern) => {
    const matches = lowerText.match(pattern);
    return sum + (matches ? matches.length : 0);
  }, 0);
  
  // Require minimum confidence (at least 5 matches)
  const minMatches = 5;
  if (ptScore < minMatches && esScore < minMatches && enScore < minMatches) {
    return null;
  }
  
  // Return language with highest score
  if (ptScore > esScore && ptScore > enScore) return "pt-BR";
  if (esScore > ptScore && esScore > enScore) return "es-ES";
  if (enScore > ptScore && enScore > esScore) return "en-US";
  
  return null;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem("aion-language");
    if (saved && (saved === "pt-BR" || saved === "en-US" || saved === "es-ES")) {
      return saved as Language;
    }
    return detectBrowserLanguage();
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem("aion-language", lang);
  };

  const value = {
    language,
    setLanguage,
    t: translations[language],
  };

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }
  return context;
}
