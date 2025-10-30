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
      
      // Tabs
      tabs: {
        overview: string;
        kbSearches: string;
        freeApis: string;
        openai: string;
        webSearches: string;
        deepWeb: string;
        limitsAlerts: string;
      };
      
      // Overview
      overview: {
        title: string;
        usageTrends: string;
        trendsDesc: string;
        periodButtons: {
          today: string;
          week: string;
          month: string;
          quarter: string;
          year: string;
          fiveYears: string;
          custom: string;
        };
        breakdown: string;
        exportData: string;
        exportCSV: string;
        exportPNG: string;
        totalTokens: string;
        totalRequests: string;
        totalCost: string;
        dailyUsage: string;
        pleaseSelectBothDates: string;
        startDateBeforeEndDate: string;
        customDateRangeApplied: string;
        generatingPNG: string;
        pleaseWait: string;
        pngExported: string;
        csvExported: string;
       };
      
      // Limits & Alerts
      limits: {
        title: string;
        subtitle: string;
        configureTitle: string;
        configureDesc: string;
        dailyLimits: string;
        monthlyLimits: string;
        dailyTokenLimit: string;
        dailyCostLimit: string;
        monthlyTokenLimit: string;
        monthlyCostLimit: string;
        saveButton: string;
        saving: string;
        successMessage: string;
        activeAlerts: string;
        noAlerts: string;
        noAlertsDesc: string;
        acknowledged: string;
        acknowledge: string;
      };
      
      // Free APIs
      freeApis: {
        title: string;
        trendsTitle: string;
        trendsDesc: string;
        detailedHistory: string;
        detailedHistoryDesc: string;
        recentRequests: string;
        model: string;
        promptTokens: string;
        completionTokens: string;
        totalTokensLabel: string;
        timestamp: string;
        noHistory: string;
        noHistoryDesc: string;
      };
      
      // KB Searches
      kbSearches: {
        title: string;
        historyTitle: string;
        historyDesc: string;
        recentSearches: string;
        query: string;
        results: string;
        confidence: string;
        timestamp: string;
        noHistory: string;
        noHistoryDesc: string;
      };
      
      // Web Searches
      webSearches: {
        title: string;
        statsTitle: string;
        statsDesc: string;
        totalSearches: string;
        successfulSearches: string;
        totalSources: string;
        uniqueDomains: string;
        historyTitle: string;
        historyDesc: string;
        recentSearches: string;
        query: string;
        resultsCount: string;
        timestamp: string;
        viewSources: string;
        noHistory: string;
        noHistoryDesc: string;
      };
      
      // DeepWeb
      deepWeb: {
        title: string;
        statsTitle: string;
        statsDesc: string;
        totalSearches: string;
        successfulSearches: string;
        totalSources: string;
        uniqueDomains: string;
        historyTitle: string;
        historyDesc: string;
        recentSearches: string;
        query: string;
        resultsCount: string;
        timestamp: string;
        viewSources: string;
        noHistory: string;
        noHistoryDesc: string;
      };
      
      // OpenAI
      openaiTab: {
        title: string;
        usageTrends: string;
        trendsDesc: string;
        costHistory: string;
        costHistoryDesc: string;
        totalCost: string;
        avgCostPerRequest: string;
        totalRequests: string;
      };
      
      // Common
      common: {
        loading: string;
        error: string;
        noData: string;
        date: string;
        provider: string;
        status: string;
        success: string;
        failed: string;
        paid: string;
        paidAPIRequests: string;
        searches: string;
        chartNotFound: string;
        failedGeneratePNG: string;
        exportFailed: string;
        unknownError: string;
        sources: string;
        moreSources: string;
        acknowledging: string;
        viewSources: string;
      };
    };
    
    // Auto-Evolution
    autoEvolution: {
      title: string;
      subtitle: string;
      loading: string;
      
      overview: {
        conversationsCollected: string;
        highQualityNote: string;
        avgQualityScore: string;
        aboveThreshold: string;
        kbGeneratedDatasets: string;
        totalDatasets: string;
        trainingJobs: string;
        completionRate: string;
      };
      
      efficiency: {
        collectionEfficiency: string;
        collectionEfficiencyDesc: string;
        datasetsFrom: string;
        conversations: string;
        highQualityRate: string;
        highQualityRateDesc: string;
        jobSuccessRate: string;
        jobSuccessRateDesc: string;
        jobsCompleted: string;
      };
      
      timeline: {
        title: string;
        subtitle: string;
        conversationsLabel: string;
        avgScoreLabel: string;
        noData: string;
      };
      
      systemStatus: {
        title: string;
        subtitle: string;
        conversationCollection: string;
        active: string;
        waitingForConversations: string;
        kbIntegration: string;
        noDatasetsYet: string;
        federatedTraining: string;
        jobsCompleted: string;
        noJobsYet: string;
      };
    };
    
    // Cost History
    costHistory: {
      overview: {
        totalCost: string;
        paidRequests: string;
        providers: string;
      };
      charts: {
        costDistribution: string;
        costByProvider: string;
      };
      history: {
        title: string;
        subtitle: string;
        tokens: string;
        noCostHistory: string;
      };
    };
    
    // Token History  
    tokenHistory: {
      overview: {
        totalRecords: string;
        totalTokens: string;
        totalCost: string;
      };
      history: {
        title: string;
        subtitle: string;
        tokens: string;
        noHistory: string;
      };
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
        
        tabs: {
          overview: "Visão Geral",
          kbSearches: "Buscas KB",
          freeApis: "APIs Gratuitas",
          openai: "OpenAI",
          webSearches: "Buscas Web",
          deepWeb: "DeepWeb",
          limitsAlerts: "Limites & Alertas",
        },
        
        overview: {
          title: "Visão Geral",
          usageTrends: "Tendências de Uso",
          trendsDesc: "Consumo de tokens ao longo do tempo",
          periodButtons: {
            today: "Hoje",
            week: "7 dias",
            month: "30 dias",
            quarter: "90 dias",
            year: "1 ano",
            fiveYears: "5 anos",
            custom: "Período Personalizado",
          },
          breakdown: "Detalhamento por Provedor",
          exportData: "Exportar Dados",
          exportCSV: "Exportar CSV",
          exportPNG: "Exportar PNG",
          totalTokens: "Total de Tokens",
          totalRequests: "Total de Requisições",
          totalCost: "Custo Total",
          dailyUsage: "Uso Diário",
          pleaseSelectBothDates: "Por favor, selecione ambas as datas",
          startDateBeforeEndDate: "Data inicial deve ser anterior à data final",
          customDateRangeApplied: "Período personalizado aplicado",
          generatingPNG: "Gerando PNG…",
          pleaseWait: "Por favor, aguarde",
          pngExported: "PNG exportado",
          csvExported: "CSV exportado",
        },
        
        limits: {
          title: "Limites & Alertas",
          subtitle: "Configure limites e monitore alertas",
          configureTitle: "Configurar Limites de Uso",
          configureDesc: "Defina limites de tokens e custos para evitar excesso",
          dailyLimits: "Limites Diários",
          monthlyLimits: "Limites Mensais",
          dailyTokenLimit: "Limite Diário de Tokens",
          dailyCostLimit: "Limite Diário de Custo ($)",
          monthlyTokenLimit: "Limite Mensal de Tokens",
          monthlyCostLimit: "Limite Mensal de Custo ($)",
          saveButton: "Salvar Limites",
          saving: "Salvando...",
          successMessage: "Limites configurados com sucesso",
          activeAlerts: "Alertas Ativos",
          noAlerts: "Nenhum alerta ativo",
          noAlertsDesc: "Todos os limites estão dentro do esperado",
          acknowledged: "Reconhecido",
          acknowledge: "Reconhecer",
        },
        
        freeApis: {
          title: "APIs Gratuitas",
          trendsTitle: "Tendências de Uso de APIs Gratuitas",
          trendsDesc: "Consumo diário por provedor",
          detailedHistory: "Histórico Detalhado de APIs Gratuitas",
          detailedHistoryDesc: "Registro completo de todas as requisições",
          recentRequests: "Requisições Recentes",
          model: "Modelo",
          promptTokens: "Tokens Prompt",
          completionTokens: "Tokens Completion",
          totalTokensLabel: "Total",
          timestamp: "Data/Hora",
          noHistory: "Nenhum histórico disponível",
          noHistoryDesc: "Não há requisições registradas no período selecionado",
        },
        
        kbSearches: {
          title: "Buscas na Knowledge Base",
          historyTitle: "Histórico de Buscas KB",
          historyDesc: "Consultas realizadas na base de conhecimento",
          recentSearches: "Buscas Recentes",
          query: "Consulta",
          results: "Resultados",
          confidence: "Confiança",
          timestamp: "Data/Hora",
          noHistory: "Nenhum histórico disponível",
          noHistoryDesc: "Não há buscas registradas",
        },
        
        webSearches: {
          title: "Buscas Web",
          statsTitle: "Estatísticas de Buscas Web",
          statsDesc: "Resumo de buscas e fontes indexadas",
          totalSearches: "Total de Buscas",
          successfulSearches: "Buscas Bem-Sucedidas",
          totalSources: "Total de Fontes",
          uniqueDomains: "Domínios Únicos",
          historyTitle: "Histórico de Buscas Web",
          historyDesc: "Consultas realizadas na web",
          recentSearches: "Buscas Recentes",
          query: "Consulta",
          resultsCount: "Resultados",
          timestamp: "Data/Hora",
          viewSources: "Ver Fontes",
          noHistory: "Nenhum histórico disponível",
          noHistoryDesc: "Não há buscas web registradas",
        },
        
        deepWeb: {
          title: "DeepWeb",
          statsTitle: "Estatísticas de Buscas DeepWeb",
          statsDesc: "Resumo de buscas na rede Tor",
          totalSearches: "Total de Buscas",
          successfulSearches: "Buscas Bem-Sucedidas",
          totalSources: "Total de Fontes",
          uniqueDomains: "Domínios Únicos",
          historyTitle: "Histórico de Buscas DeepWeb",
          historyDesc: "Consultas realizadas na rede Tor",
          recentSearches: "Buscas Recentes",
          query: "Consulta",
          resultsCount: "Resultados",
          timestamp: "Data/Hora",
          viewSources: "Ver Fontes",
          noHistory: "Nenhum histórico disponível",
          noHistoryDesc: "Não há buscas na DeepWeb registradas",
        },
        
        openaiTab: {
          title: "OpenAI",
          usageTrends: "Tendências de Uso OpenAI",
          trendsDesc: "Consumo de tokens e custos ao longo do tempo",
          costHistory: "Histórico de Custos Diários",
          costHistoryDesc: "Gastos por dia",
          totalCost: "Custo Total",
          avgCostPerRequest: "Custo Médio por Requisição",
          totalRequests: "Total de Requisições",
        },
        
        common: {
          loading: "Carregando...",
          error: "Erro ao carregar dados",
          noData: "Nenhum dado disponível",
          date: "Data",
          provider: "Provedor",
          status: "Status",
          success: "Sucesso",
          failed: "Falhou",
          paid: "Pago",
          paidAPIRequests: "requisições API pagas",
          searches: "buscas",
          chartNotFound: "Gráfico não encontrado",
          failedGeneratePNG: "Falha ao gerar PNG",
          exportFailed: "Falha na exportação",
          unknownError: "Erro desconhecido",
          sources: "fontes",
          moreSources: "mais fontes",
          acknowledging: "Reconhecendo...",
          viewSources: "Ver Fontes",
        },
      },
      
      autoEvolution: {
        title: "Auto-Evolução",
        subtitle: "Monitore métricas de aprendizado contínuo e auto-aperfeiçoamento",
        loading: "Carregando estatísticas de auto-evolução...",
        
        overview: {
          conversationsCollected: "Conversas Coletadas",
          highQualityNote: "alta qualidade (pontuação ≥ 60)",
          avgQualityScore: "Pontuação Média de Qualidade",
          aboveThreshold: "acima do limite",
          kbGeneratedDatasets: "Datasets Gerados pela KB",
          totalDatasets: "total de datasets",
          trainingJobs: "Training Jobs",
          completionRate: "taxa de conclusão",
        },
        
        efficiency: {
          collectionEfficiency: "Eficiência de Coleta",
          collectionEfficiencyDesc: "Conversas convertidas com sucesso em datasets",
          datasetsFrom: "datasets de",
          conversations: "conversas",
          highQualityRate: "Taxa de Alta Qualidade",
          highQualityRateDesc: "Porcentagem de conversas acima do limite de qualidade",
          jobSuccessRate: "Taxa de Sucesso dos Jobs",
          jobSuccessRateDesc: "Training jobs concluídos com sucesso",
          jobsCompleted: "jobs concluídos",
        },
        
        timeline: {
          title: "Linha do Tempo de Coleta (Últimos 30 Dias)",
          subtitle: "Tendências diárias de coleta de conversas e qualidade",
          conversationsLabel: "Conversas",
          avgScoreLabel: "Pontuação Média",
          noData: "Nenhum dado disponível para os últimos 30 dias",
        },
        
        systemStatus: {
          title: "Status do Sistema de Auto-Evolução",
          subtitle: "Saúde do pipeline de aprendizado contínuo",
          conversationCollection: "Coleta de Conversas",
          active: "Ativo",
          waitingForConversations: "Aguardando conversas",
          kbIntegration: "Integração KB",
          noDatasetsYet: "Nenhum dataset gerado ainda",
          federatedTraining: "Treinamento Federado",
          jobsCompleted: "jobs concluídos",
          noJobsYet: "Nenhum job concluído ainda",
        },
      },
      
      costHistory: {
        overview: {
          totalCost: "Custo Total",
          paidRequests: "Requisições Pagas",
          providers: "Provedores",
        },
        charts: {
          costDistribution: "Distribuição de Custos por Provedor",
          costByProvider: "Custo por Provedor",
        },
        history: {
          title: "Histórico Completo de Custos",
          subtitle: "Últimas 500 requisições API pagas",
          tokens: "tokens",
          noCostHistory: "Nenhum histórico de custos encontrado",
        },
      },
      
      tokenHistory: {
        overview: {
          totalRecords: "Total de Registros",
          totalTokens: "Total de Tokens",
          totalCost: "Custo Total",
        },
        history: {
          title: "Histórico Completo de Uso de Tokens",
          subtitle: "Últimos 500 registros de todos os provedores (APIs Gratuitas + OpenAI)",
          tokens: "tokens",
          noHistory: "Nenhum histórico de uso de tokens encontrado",
        },
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
        
        tabs: {
          overview: "Overview",
          kbSearches: "KB Searches",
          freeApis: "Free APIs",
          openai: "OpenAI",
          webSearches: "Web Searches",
          deepWeb: "DeepWeb",
          limitsAlerts: "Limits & Alerts",
        },
        
        overview: {
          title: "Overview",
          usageTrends: "Usage Trends",
          trendsDesc: "Token consumption over time",
          periodButtons: {
            today: "Today",
            week: "7 days",
            month: "30 days",
            quarter: "90 days",
            year: "1 year",
            fiveYears: "5 years",
            custom: "Custom Period",
          },
          breakdown: "Breakdown by Provider",
          exportData: "Export Data",
          exportCSV: "Export CSV",
          exportPNG: "Export PNG",
          totalTokens: "Total Tokens",
          totalRequests: "Total Requests",
          totalCost: "Total Cost",
          dailyUsage: "Daily Usage",
          pleaseSelectBothDates: "Please select both dates",
          startDateBeforeEndDate: "Start date must be before end date",
          customDateRangeApplied: "Custom date range applied",
          generatingPNG: "Generating PNG…",
          pleaseWait: "Please wait",
          pngExported: "PNG exported",
          csvExported: "CSV exported",
        },
        
        limits: {
          title: "Limits & Alerts",
          subtitle: "Configure limits and monitor alerts",
          configureTitle: "Configure Usage Limits",
          configureDesc: "Set token and cost limits to prevent overuse",
          dailyLimits: "Daily Limits",
          monthlyLimits: "Monthly Limits",
          dailyTokenLimit: "Daily Token Limit",
          dailyCostLimit: "Daily Cost Limit ($)",
          monthlyTokenLimit: "Monthly Token Limit",
          monthlyCostLimit: "Monthly Cost Limit ($)",
          saveButton: "Save Limits",
          saving: "Saving...",
          successMessage: "Limits configured successfully",
          activeAlerts: "Active Alerts",
          noAlerts: "No active alerts",
          noAlertsDesc: "All limits are within expected ranges",
          acknowledged: "Acknowledged",
          acknowledge: "Acknowledge",
        },
        
        freeApis: {
          title: "Free APIs",
          trendsTitle: "Free APIs Usage Trends",
          trendsDesc: "Daily consumption per provider",
          detailedHistory: "Detailed Free APIs History",
          detailedHistoryDesc: "Complete log of all requests",
          recentRequests: "Recent Requests",
          model: "Model",
          promptTokens: "Prompt Tokens",
          completionTokens: "Completion Tokens",
          totalTokensLabel: "Total",
          timestamp: "Timestamp",
          noHistory: "No history available",
          noHistoryDesc: "No requests recorded in the selected period",
        },
        
        kbSearches: {
          title: "Knowledge Base Searches",
          historyTitle: "KB Search History",
          historyDesc: "Queries performed on the knowledge base",
          recentSearches: "Recent Searches",
          query: "Query",
          results: "Results",
          confidence: "Confidence",
          timestamp: "Timestamp",
          noHistory: "No history available",
          noHistoryDesc: "No searches recorded",
        },
        
        webSearches: {
          title: "Web Searches",
          statsTitle: "Web Search Statistics",
          statsDesc: "Summary of searches and indexed sources",
          totalSearches: "Total Searches",
          successfulSearches: "Successful Searches",
          totalSources: "Total Sources",
          uniqueDomains: "Unique Domains",
          historyTitle: "Web Search History",
          historyDesc: "Web queries performed",
          recentSearches: "Recent Searches",
          query: "Query",
          resultsCount: "Results",
          timestamp: "Timestamp",
          viewSources: "View Sources",
          noHistory: "No history available",
          noHistoryDesc: "No web searches recorded",
        },
        
        deepWeb: {
          title: "DeepWeb",
          statsTitle: "DeepWeb Search Statistics",
          statsDesc: "Summary of Tor network searches",
          totalSearches: "Total Searches",
          successfulSearches: "Successful Searches",
          totalSources: "Total Sources",
          uniqueDomains: "Unique Domains",
          historyTitle: "DeepWeb Search History",
          historyDesc: "Tor network queries performed",
          recentSearches: "Recent Searches",
          query: "Query",
          resultsCount: "Results",
          timestamp: "Timestamp",
          viewSources: "View Sources",
          noHistory: "No history available",
          noHistoryDesc: "No DeepWeb searches recorded",
        },
        
        openaiTab: {
          title: "OpenAI",
          usageTrends: "OpenAI Usage Trends",
          trendsDesc: "Token consumption and costs over time",
          costHistory: "Daily Cost History",
          costHistoryDesc: "Expenses per day",
          totalCost: "Total Cost",
          avgCostPerRequest: "Avg Cost per Request",
          totalRequests: "Total Requests",
        },
        
        common: {
          loading: "Loading...",
          error: "Error loading data",
          noData: "No data available",
          date: "Date",
          provider: "Provider",
          status: "Status",
          success: "Success",
          failed: "Failed",
          paid: "Paid",
          paidAPIRequests: "paid API requests",
          searches: "searches",
          chartNotFound: "Chart not found",
          failedGeneratePNG: "Failed to generate PNG",
          exportFailed: "Export failed",
          unknownError: "Unknown error",
          sources: "sources",
          moreSources: "more sources",
          acknowledging: "Acknowledging...",
          viewSources: "View Sources",
        },
      },
      
      autoEvolution: {
        title: "Auto-Evolution",
        subtitle: "Monitor continuous learning and self-improvement metrics",
        loading: "Loading auto-evolution stats...",
        
        overview: {
          conversationsCollected: "Conversations Collected",
          highQualityNote: "high-quality (score ≥ 60)",
          avgQualityScore: "Avg Quality Score",
          aboveThreshold: "above threshold",
          kbGeneratedDatasets: "KB-Generated Datasets",
          totalDatasets: "total datasets",
          trainingJobs: "Training Jobs",
          completionRate: "completion rate",
        },
        
        efficiency: {
          collectionEfficiency: "Collection Efficiency",
          collectionEfficiencyDesc: "Conversations successfully converted to datasets",
          datasetsFrom: "datasets from",
          conversations: "conversations",
          highQualityRate: "High-Quality Rate",
          highQualityRateDesc: "Percentage of conversations above quality threshold",
          jobSuccessRate: "Job Success Rate",
          jobSuccessRateDesc: "Training jobs completed successfully",
          jobsCompleted: "jobs completed",
        },
        
        timeline: {
          title: "Collection Timeline (Last 30 Days)",
          subtitle: "Daily conversation collection and quality trends",
          conversationsLabel: "Conversations",
          avgScoreLabel: "Avg Score",
          noData: "No data available for the last 30 days",
        },
        
        systemStatus: {
          title: "Auto-Evolution System Status",
          subtitle: "Continuous learning pipeline health",
          conversationCollection: "Conversation Collection",
          active: "Active",
          waitingForConversations: "Waiting for conversations",
          kbIntegration: "KB Integration",
          noDatasetsYet: "No datasets generated yet",
          federatedTraining: "Federated Training",
          jobsCompleted: "jobs completed",
          noJobsYet: "No jobs completed yet",
        },
      },
      
      costHistory: {
        overview: {
          totalCost: "Total Cost",
          paidRequests: "Paid Requests",
          providers: "Providers",
        },
        charts: {
          costDistribution: "Cost Distribution by Provider",
          costByProvider: "Cost by Provider",
        },
        history: {
          title: "Complete Cost History",
          subtitle: "Last 500 paid API requests",
          tokens: "tokens",
          noCostHistory: "No cost history found",
        },
      },
      
      tokenHistory: {
        overview: {
          totalRecords: "Total Records",
          totalTokens: "Total Tokens",
          totalCost: "Total Cost",
        },
        history: {
          title: "Complete Token Usage History",
          subtitle: "Last 500 records from all providers (Free APIs + OpenAI)",
          tokens: "tokens",
          noHistory: "No token usage history found",
        },
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
        
        tabs: {
          overview: "Resumen",
          kbSearches: "Búsquedas KB",
          freeApis: "APIs Gratuitas",
          openai: "OpenAI",
          webSearches: "Búsquedas Web",
          deepWeb: "DeepWeb",
          limitsAlerts: "Límites y Alertas",
        },
        
        overview: {
          title: "Resumen",
          usageTrends: "Tendencias de Uso",
          trendsDesc: "Consumo de tokens a lo largo del tiempo",
          periodButtons: {
            today: "Hoy",
            week: "7 días",
            month: "30 días",
            quarter: "90 días",
            year: "1 año",
            fiveYears: "5 años",
            custom: "Período Personalizado",
          },
          breakdown: "Desglose por Proveedor",
          exportData: "Exportar Datos",
          exportCSV: "Exportar CSV",
          exportPNG: "Exportar PNG",
          totalTokens: "Total de Tokens",
          totalRequests: "Total de Solicitudes",
          totalCost: "Costo Total",
          dailyUsage: "Uso Diario",
          pleaseSelectBothDates: "Por favor, selecciona ambas fechas",
          startDateBeforeEndDate: "La fecha inicial debe ser anterior a la fecha final",
          customDateRangeApplied: "Período personalizado aplicado",
          generatingPNG: "Generando PNG…",
          pleaseWait: "Por favor, espera",
          pngExported: "PNG exportado",
          csvExported: "CSV exportado",
        },
        
        limits: {
          title: "Límites y Alertas",
          subtitle: "Configura límites y monitorea alertas",
          configureTitle: "Configurar Límites de Uso",
          configureDesc: "Define límites de tokens y costos para evitar exceso",
          dailyLimits: "Límites Diarios",
          monthlyLimits: "Límites Mensuales",
          dailyTokenLimit: "Límite Diario de Tokens",
          dailyCostLimit: "Límite Diario de Costo ($)",
          monthlyTokenLimit: "Límite Mensual de Tokens",
          monthlyCostLimit: "Límite Mensual de Costo ($)",
          saveButton: "Guardar Límites",
          saving: "Guardando...",
          successMessage: "Límites configurados con éxito",
          activeAlerts: "Alertas Activas",
          noAlerts: "No hay alertas activas",
          noAlertsDesc: "Todos los límites están dentro de lo esperado",
          acknowledged: "Reconocido",
          acknowledge: "Reconocer",
        },
        
        freeApis: {
          title: "APIs Gratuitas",
          trendsTitle: "Tendencias de Uso de APIs Gratuitas",
          trendsDesc: "Consumo diario por proveedor",
          detailedHistory: "Historial Detallado de APIs Gratuitas",
          detailedHistoryDesc: "Registro completo de todas las solicitudes",
          recentRequests: "Solicitudes Recientes",
          model: "Modelo",
          promptTokens: "Tokens Prompt",
          completionTokens: "Tokens Completion",
          totalTokensLabel: "Total",
          timestamp: "Fecha/Hora",
          noHistory: "No hay historial disponible",
          noHistoryDesc: "No hay solicitudes registradas en el período seleccionado",
        },
        
        kbSearches: {
          title: "Búsquedas en Base de Conocimiento",
          historyTitle: "Historial de Búsquedas KB",
          historyDesc: "Consultas realizadas en la base de conocimiento",
          recentSearches: "Búsquedas Recientes",
          query: "Consulta",
          results: "Resultados",
          confidence: "Confianza",
          timestamp: "Fecha/Hora",
          noHistory: "No hay historial disponible",
          noHistoryDesc: "No hay búsquedas registradas",
        },
        
        webSearches: {
          title: "Búsquedas Web",
          statsTitle: "Estadísticas de Búsquedas Web",
          statsDesc: "Resumen de búsquedas y fuentes indexadas",
          totalSearches: "Total de Búsquedas",
          successfulSearches: "Búsquedas Exitosas",
          totalSources: "Total de Fuentes",
          uniqueDomains: "Dominios Únicos",
          historyTitle: "Historial de Búsquedas Web",
          historyDesc: "Consultas realizadas en la web",
          recentSearches: "Búsquedas Recientes",
          query: "Consulta",
          resultsCount: "Resultados",
          timestamp: "Fecha/Hora",
          viewSources: "Ver Fuentes",
          noHistory: "No hay historial disponible",
          noHistoryDesc: "No hay búsquedas web registradas",
        },
        
        deepWeb: {
          title: "DeepWeb",
          statsTitle: "Estadísticas de Búsquedas DeepWeb",
          statsDesc: "Resumen de búsquedas en red Tor",
          totalSearches: "Total de Búsquedas",
          successfulSearches: "Búsquedas Exitosas",
          totalSources: "Total de Fuentes",
          uniqueDomains: "Dominios Únicos",
          historyTitle: "Historial de Búsquedas DeepWeb",
          historyDesc: "Consultas realizadas en red Tor",
          recentSearches: "Búsquedas Recientes",
          query: "Consulta",
          resultsCount: "Resultados",
          timestamp: "Fecha/Hora",
          viewSources: "Ver Fuentes",
          noHistory: "No hay historial disponible",
          noHistoryDesc: "No hay búsquedas en DeepWeb registradas",
        },
        
        openaiTab: {
          title: "OpenAI",
          usageTrends: "Tendencias de Uso OpenAI",
          trendsDesc: "Consumo de tokens y costos a lo largo del tiempo",
          costHistory: "Historial de Costos Diarios",
          costHistoryDesc: "Gastos por día",
          totalCost: "Costo Total",
          avgCostPerRequest: "Costo Promedio por Solicitud",
          totalRequests: "Total de Solicitudes",
        },
        
        common: {
          loading: "Cargando...",
          error: "Error al cargar datos",
          noData: "No hay datos disponibles",
          date: "Fecha",
          provider: "Proveedor",
          status: "Estado",
          success: "Éxito",
          failed: "Fallido",
          paid: "Pagado",
          paidAPIRequests: "solicitudes API pagadas",
          searches: "búsquedas",
          chartNotFound: "Gráfico no encontrado",
          failedGeneratePNG: "Error al generar PNG",
          exportFailed: "Error en la exportación",
          unknownError: "Error desconocido",
          sources: "fuentes",
          moreSources: "más fuentes",
          acknowledging: "Reconociendo...",
          viewSources: "Ver Fuentes",
        },
      },
      
      autoEvolution: {
        title: "Auto-Evolución",
        subtitle: "Monitorea métricas de aprendizaje continuo y auto-mejora",
        loading: "Cargando estadísticas de auto-evolución...",
        
        overview: {
          conversationsCollected: "Conversaciones Recolectadas",
          highQualityNote: "alta calidad (puntuación ≥ 60)",
          avgQualityScore: "Puntuación Media de Calidad",
          aboveThreshold: "por encima del umbral",
          kbGeneratedDatasets: "Datasets Generados por KB",
          totalDatasets: "total de datasets",
          trainingJobs: "Training Jobs",
          completionRate: "tasa de finalización",
        },
        
        efficiency: {
          collectionEfficiency: "Eficiencia de Recolección",
          collectionEfficiencyDesc: "Conversaciones convertidas exitosamente a datasets",
          datasetsFrom: "datasets de",
          conversations: "conversaciones",
          highQualityRate: "Tasa de Alta Calidad",
          highQualityRateDesc: "Porcentaje de conversaciones por encima del umbral de calidad",
          jobSuccessRate: "Tasa de Éxito de Jobs",
          jobSuccessRateDesc: "Training jobs completados exitosamente",
          jobsCompleted: "jobs completados",
        },
        
        timeline: {
          title: "Línea de Tiempo de Recolección (Últimos 30 Días)",
          subtitle: "Tendencias diarias de recolección de conversaciones y calidad",
          conversationsLabel: "Conversaciones",
          avgScoreLabel: "Puntuación Media",
          noData: "No hay datos disponibles para los últimos 30 días",
        },
        
        systemStatus: {
          title: "Estado del Sistema de Auto-Evolución",
          subtitle: "Salud del pipeline de aprendizaje continuo",
          conversationCollection: "Recolección de Conversaciones",
          active: "Activo",
          waitingForConversations: "Esperando conversaciones",
          kbIntegration: "Integración KB",
          noDatasetsYet: "No se han generado datasets aún",
          federatedTraining: "Entrenamiento Federado",
          jobsCompleted: "jobs completados",
          noJobsYet: "No se han completado jobs aún",
        },
      },
      
      costHistory: {
        overview: {
          totalCost: "Costo Total",
          paidRequests: "Solicitudes Pagadas",
          providers: "Proveedores",
        },
        charts: {
          costDistribution: "Distribución de Costos por Proveedor",
          costByProvider: "Costo por Proveedor",
        },
        history: {
          title: "Historial Completo de Costos",
          subtitle: "Últimas 500 solicitudes API pagadas",
          tokens: "tokens",
          noCostHistory: "No se encontró historial de costos",
        },
      },
      
      tokenHistory: {
        overview: {
          totalRecords: "Total de Registros",
          totalTokens: "Total de Tokens",
          totalCost: "Costo Total",
        },
        history: {
          title: "Historial Completo de Uso de Tokens",
          subtitle: "Últimos 500 registros de todos los proveedores (APIs Gratuitas + OpenAI)",
          tokens: "tokens",
          noHistory: "No se encontró historial de uso de tokens",
        },
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
