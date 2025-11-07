import { createContext, useContext, useState, ReactNode } from "react";

export type Language = "pt-BR" | "en-US" | "es-ES";

interface Translations {
  // Common UI strings
  common: {
    error: string;
    success: string;
    loading: string;
    loadingError: string;
    saveSuccess: string;
    saveError: string;
    deleteSuccess: string;
    deleteError: string;
    createSuccess: string;
    createError: string;
    updateSuccess: string;
    updateError: string;
    refresh: string;
    active: string;
    inactive: string;
    created: string;
    statusText: string;
    status: {
      ready: string;
      processing: string;
      failed: string;
    };
  };

  // Not Found Page
  notFound: {
    title: string;
    message: string;
  };

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
    languageDetected: string;
    switchedTo: string;
    tooManyFiles: string;
    maxFilesAllowed: string;
    transcriptionFailed: string;
    transcriptionComplete: string;
    audioTranscribed: string;
    transcriptionError: string;
    transcriptionRetry: string;
    microphoneAccessDenied: string;
    allowMicrophoneAccess: string;
    recordAudio: string;
    stopRecording: string;
    filesAttached: string;
    filesReady: string;
    error: string;
    failedToInitialize: string;
    pleaseRefresh: string;
    failedToLoad: string;
    failedToCreate: string;
    failedToSend: string;
    noConversationActive: string;
    browserNoAudioSupport: string;
    attachFilesHint: string;
    streamingOn: string;
    streamingOff: string;
    imageAlt: string;
  };
  
  // Admin Dashboard
  admin: {
    title: string;
    subtitle: string;
    backToChat: string;
    
    // Main Tabs
    tabs: {
      overview: string;
      telemetry: string;
      tokenMonitoring: string;
      history: string;
      costHistory: string;
      knowledgeBase: string;
      gpuManagement: string;
      federatedTraining: string;
      autoEvolution: string;
      datasets: string;
      agents: string;
      curation: string;
      settings: string;
    };

    // Sidebar
    sidebar: {
      navigation: string;
      categories: {
        commandCenter: string;
        analytics: string;
        knowledgeVision: string;
        autonomousAI: string;
        trainingFabric: string;
        operations: string;
        accessGovernance: string;
        systemConfig: string;
      };
    };
    
    // Overview Tab
    overview: {
      totalTokens: string;
      totalCost: string;
      kbSearches: string;
      freeApis: string;
      openai: string;
      webSearches: string;
      kbDocuments: string;
      gpuWorkers: string;
      federatedJobs: string;
      allProviders: string;
      openaiOnly: string;
      knowledgeBaseQueries: string;
      groqGeminiHfOpenrouter: string;
      paidApiRequests: string;
      domainsSearched: string;
      duckduckgoProvider: string;
      torNetworkQueries: string;
      indexedKnowledge: string;
      healthyGpuWorkers: string;
      completedTrainingJobs: string;
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
      imagesTab: string;
      
      actions: {
        addText: string;
        learnFromUrl: string;
        searchWeb: string;
        uploadFiles: string;
      };
      
      toasts: {
        knowledgeAdded: string;
        urlContentLearned: string;
        webSearchSuccess: string; // {{count}} novos conhecimentos adicionados!
        searchLabel: string; // Pesquisa:
        documentUpdated: string;
        documentRemoved: string;
        uploadingFiles: string;
        processingFiles: string; // Processando {{count}} arquivo(s)...
        uploadCompleted: string;
        filesProcessed: string; // {{count}} arquivo(s) processado(s) e indexado(s)
        uploadError: string;
        processingFailed: string;
        error: string;
      };
      
      forms: {
        addText: {
          title: string;
          titlePlaceholder: string;
          contentPlaceholder: string;
          saving: string;
          save: string;
        };
        learnUrl: {
          title: string;
          description: string;
          urlPlaceholder: string;
          learning: string;
          learnFromThisUrl: string;
        };
        webSearch: {
          title: string;
          description: string;
          searchPlaceholder: string;
          searching: string;
          searchAndLearn: string;
        };
      };
      
      documents: {
        title: string;
        subtitle: string;
        source: string;
        save: string;
        cancel: string;
        confirmDelete: string;
      };
      
      states: {
        loading: string;
        noDocuments: string;
      };
    };
    
    // GPU Management
    gpuManagement: {
      title: string;
      subtitle: string;
      activeWorkers: string;
      totalGPUs: string;
      totalRequests: string;
      avgLatency: string;
      avgLatencyMs: string;
      errorRate: string;
      workersOnline: string;
      requestsProcessed: string;
      avgResponseTime: string;
      failedRequests: string;
      registeredWorkers: string;
      manageAllGpuWorkers: string;
      provider: string;
      account: string;
      model: string;
      gpu: string;
      status: string;
      health: string;
      tempo: string;
      time: {
        never: string;
        na: string;
        shuttingDown: string;
        secondsAgo: string;
        minutesAgo: string;
        hoursAgo: string;
        hourUnit: string;
        minuteUnit: string;
        secondUnit: string;
      };
      requests: string;
      latency: string;
      lastUsed: string;
      actions: string;
      healthy: string;
      unhealthy: string;
      online: string;
      offline: string;
      pending: string;
      addWorker: string;
      refresh: string;
      edit: string;
      delete: string;
      remove: string;
      loading: string;
      noWorkers: string;
      noWorkersDesc: string;
      confirmDelete: string;
      toast: {
        workerRemoved: string;
        workerRemovedDesc: string;
        error: string;
        errorRemovingWorker: string;
      };
    };
    
    // Add GPU Worker Dialog
    addGpuWorker: {
      title: string;
      description: string;
      kaggleTab: string;
      colabTab: string;
      kaggle: {
        title: string;
        subtitle: string;
        username: string;
        usernamePlaceholder: string;
        apiKey: string;
        apiKeyPlaceholder: string;
        apiKeyHelp: string;
        notebookName: string;
        notebookNamePlaceholder: string;
        howItWorks: string;
        step1: string;
        step2: string;
        step3: string;
        step4: string;
        cancel: string;
        provision: string;
        provisioning: string;
        requiredFields: string;
        requiredFieldsDesc: string;
        success: string;
        successDesc: string;
        error: string;
        errorDesc: string;
      };
      colab: {
        title: string;
        subtitle: string;
        email: string;
        emailPlaceholder: string;
        password: string;
        passwordPlaceholder: string;
        passwordHelp: string;
        notebookUrl: string;
        notebookUrlPlaceholder: string;
        notebookUrlHelp: string;
        howItWorks: string;
        step1: string;
        step2: string;
        step3: string;
        step4: string;
        estimatedTime: string;
        cancel: string;
        provision: string;
        provisioning: string;
        requiredFields: string;
        requiredFieldsDesc: string;
        success: string;
        successDesc: string;
        error: string;
        errorDesc: string;
      };
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
      
      // Dataset Selector
      datasetSelector: {
        label: string;
        placeholder: string;
        autoGenerated: string;
        highQuality: string;
        autoDesc: string;
      };
      
      // Job Details
      jobDetails: {
        progress: string;
        steps: string;
        globalLoss: string;
        bestLoss: string;
        completedChunks: string;
        workers: string;
        viewDetails: string;
        pause: string;
        resume: string;
        na: string;
      };
      
      // Dataset Management
      datasetManagement: {
        title: string;
        subtitle: string;
        uploadButton: string;
        noDatasets: string;
        noDatasetsDesc: string;
        type: string;
        examples: string;
        size: string;
        mbUnit: string;
        delete: string;
      };
      
      // Toast Messages
      toast: {
        datasetRequired: string;
        datasetRequiredDesc: string;
        generatingDataset: string;
        generatingDatasetDesc: string;
        datasetGenerated: string;
        datasetGeneratedDesc: string;
        datasetGenerationFailed: string;
        nameRequired: string;
        nameRequiredDesc: string;
        fileRequired: string;
        fileRequiredDesc: string;
        datasetUploaded: string;
        datasetUploadedDesc: string;
        uploadFailed: string;
        datasetDeleted: string;
        deleteFailed: string;
      };
    };
    
    // Behavior
    behavior: {
      title: string;
      description: string;
      verbosity: string;
      verbosityDesc: string;
      formality: string;
      formalityDesc: string;
      creativity: string;
      creativityDesc: string;
      precision: string;
      precisionDesc: string;
      persuasiveness: string;
      persuasivenessDesc: string;
      empathy: string;
      empathyDesc: string;
      enthusiasm: string;
      enthusiasmDesc: string;
      systemPrompt: string;
      systemPromptDesc: string;
      systemPromptPlaceholder: string;
      viewFullPrompt: string;
      previewModal: {
        title: string;
        description: string;
        loading: string;
        close: string;
        characters: string;
      };
    };
    
    // Settings
    settings: {
      title: string;
      subtitle: string;
      timezone: {
        title: string;
        description: string;
        select: string;
        currentTime: string;
        save: string;
        saving: string;
        saved: string;
        saveError: string;
      };
    };
    
    // User Management
    userManagement: {
      title: string;
      subtitle: string;
      addUser: string;
      alertInfo: string;
      usersCount: string;
      loading: string;
      noUsers: string;
      noUsersDesc: string;
      deleteConfirm: string;
      table: {
        name: string;
        email: string;
        type: string;
        roles: string;
        created: string;
        actions: string;
        noRoles: string;
      };
      dialog: {
        createTitle: string;
        editTitle: string;
        name: string;
        namePlaceholder: string;
        email: string;
        emailPlaceholder: string;
        password: string;
        passwordPlaceholder: string;
        passwordEditNote: string;
        userType: string;
        userTypeAccessLabel: string;
        userTypeAccessDescription: string;
        userTypeDashboard: string;
        userTypeChat: string;
        userTypeBoth: string;
        userTypeNone: string;
        userTypeRequired: string;
        cancel: string;
        create: string;
        creating: string;
        update: string;
        updating: string;
      };
      toasts: {
        createSuccess: string;
        createError: string;
        updateSuccess: string;
        updateError: string;
        deleteSuccess: string;
        deleteError: string;
      };
    };
    
    // Permissions Management
    permissions: {
      title: string;
      description: string;
      matrix: {
        title: string;
        permissionColumn: string;
        noPermissions: string;
      };
      validation: {
        nameRequired: string;
        moduleRequired: string;
        submoduleRequired: string;
        actionsRequired: string;
      };
      placeholders: {
        selectModule: string;
        selectModuleFirst: string;
        selectSubmodule: string;
      };
      toasts: {
        assignSuccess: string;
        assignError: string;
        revokeSuccess: string;
        revokeError: string;
        createSuccess: string;
        createError: string;
        updateSuccess: string;
        updateError: string;
        deleteSuccess: string;
        deleteError: string;
      };
      crud: {
        createButton: string;
        createTitle: string;
        editTitle: string;
        deleteTitle: string;
        deleteConfirm: string;
        codeLabel: string;
        nameLabel: string;
        moduleLabel: string;
        submoduleLabel: string;
        actionsLabel: string;
        descriptionLabel: string;
        codePlaceholder: string;
        namePlaceholder: string;
        modulePlaceholder: string;
        descriptionPlaceholder: string;
        usageWarning: string;
        usageInfo: string;
        rolesUsing: string;
        usersUsing: string;
        creating: string;
        create: string;
        saving: string;
        save: string;
        deleting: string;
        delete: string;
        cancel: string;
      };
      helpers: {
        selectSubmoduleToSeeActions: string;
        codesPreview: string;
        permissionInUse: string;
      };
    };
    
    // User-specific permissions
    userPermissions: {
      title: string;
      description: string;
    };
    
    // Agents Page
    agents: {
      title: string;
      subtitle: string;
      list: string;
      createAgent: string;
      createSubAgent: string;
      createSubagent: string;
      hierarchy: string;
      activeAgents: string;
      agentsInSystem: string;
      noAgents: string;
      noAgentsDesc: string;
      loading: string;
      name: string;
      description: string;
      namespace: string;
      tier: string;
      agent: string;
      subAgent: string;
      actions: string;
      edit: string;
      delete: string;
      confirmDelete: string;
      confirmDeleteDesc: string;
      cancel: string;
      createDialog: {
        title: string;
        subtitle: string;
        namePlaceholder: string;
        descriptionPlaceholder: string;
        create: string;
        creating: string;
      };
      editDialog: {
        title: string;
        subtitle: string;
        save: string;
        saving: string;
      };
      toast: {
        created: string;
        updated: string;
        deleted: string;
      };
    };
    
    // Datasets Page
    datasets: {
      title: string;
      subtitle: string;
    };
    
    // Curation Page
    curation: {
      title: string;
      subtitle: string;
      pending: string;
      approved: string;
      rejected: string;
      history: string;
      noPending: string;
      noPendingDesc: string;
      review: string;
      approve: string;
      reject: string;
      bulkApprove: string;
      bulkReject: string;
      selectedItems: string;
      approveAll: string;
      rejectAll: string;
      confirmApprove: string;
      confirmReject: string;
      rejectNote: string;
      rejectNotePlaceholder: string;
      submittedBy: string;
      reviewedBy: string;
      note: string;
      attachments: string;
      viewAttachment: string;
      all: string;
      pages: string;
      images: string;
    };
    
    // Jobs Page (Deep Crawling)
    jobs: {
      title: string;
      subtitle: string;
      noJobs: string;
      jobId: string;
      created: string;
      started: string;
      completed: string;
      progress: string;
      items: string;
      currentItem: string;
      namespace: string;
      maxDepth: string;
      maxPages: string;
      actionSuccess: string;
      status: {
        pending: string;
        running: string;
        paused: string;
        completed: string;
        failed: string;
        cancelled: string;
      };
      filters: {
        all: string;
        active: string;
        completed: string;
        failed: string;
      };
    };
    
    // Image Search Page
    imageSearch: {
      title: string;
      subtitle: string;
      searchPlaceholder: string;
      search: string;
      searching: string;
      clear: string;
      results: string;
      allImages: string;
      imagesIndexed: string;
      imagesFound: string;
      imagesInKb: string;
      noImages: string;
      noImagesDesc: string;
      uploadPrompt: string;
      remove: string;
      confirmRemove: string;
      removed: string;
      searchError: string;
      loading: string;
    };
    
    // Vision System Page
    vision: {
      title: string;
      subtitle: string;
      quotaMonitoring: string;
      quotaDesc: string;
      providers: string;
      providersDesc: string;
      usage: string;
      limit: string;
      available: string;
      unavailable: string;
      active: string;
      missingKey: string;
      totalRequests: string;
      successRate: string;
      tier: string;
      priority: string;
      features: string;
      model: string;
      dailyLimit: string;
      unlimited: string;
      loading: string;
      errorLoading: string;
      errorLoadingDesc: string;
      used: string;
      providersTitle: string;
      reqPerDay: string;
      statsTitle: string;
      statsDesc: string;
      noData: string;
      total: string;
      success: string;
      failed: string;
      rate: string;
    };
    
    // Namespaces Page
    namespaces: {
      title: string;
      subtitle: string;
      createRoot: string;
      createSub: string;
      createRootDesc: string;
      createSubDesc: string;
      noNamespaces: string;
      noNamespacesDesc: string;
      name: string;
      displayName: string;
      description: string;
      type: string;
      root: string;
      sub: string;
      parent: string;
      actions: string;
      edit: string;
      delete: string;
      confirmDelete: string;
      cancel: string;
      create: string;
      creating: string;
      save: string;
      saving: string;
      rootNameLabel: string;
      fullNameLabel: string;
      namePlaceholder: string;
      rootPlaceholder: string;
      displayNamePlaceholder: string;
      descriptionPlaceholder: string;
      contentPlaceholder: string;
      rootNameExample: string;
      subNameExample: string;
      rootNameHint: string;
      subNameHint: string;
      selectParent: string;
      editCustomVersion: string;
      editNamespace: string;
      validation: {
        nameRequired: string;
        nameRequiredDesc: string;
        invalidRootFormat: string;
        rootNoSlash: string;
        parentRequired: string;
        selectParentDesc: string;
        invalidFormat: string;
        subFormatError: string;
      };
      toast: {
        created: string;
        updated: string;
        deleted: string;
        contentQueued: string;
        indexError: string;
        unknownError: string;
        customVersionCreated: string;
      };
    };
    
    // Lifecycle Policies Page
    lifecycle: {
      title: string;
      subtitle: string;
      conversations: string;
      conversationsDesc: string;
      training: string;
      trainingDesc: string;
      gpu: string;
      gpuDesc: string;
      enabled: string;
      disabled: string;
      archive: string;
      purge: string;
      retention: string;
      months: string;
      years: string;
      days: string;
      save: string;
      saving: string;
      saved: string;
      unsavedChanges: string;
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

  // Meta-Learning Dashboard
  meta: {
    dashboard: {
      title: string;
      subtitle: string;
    };
    tabs: {
      algorithms: string;
      experts: string;
      improvements: string;
    };
    loading: {
      algorithms: string;
      experts: string;
      improvements: string;
    };
    empty: {
      algorithms: string;
      experts: string;
      improvements: string;
    };
    pipeline: {
      execute: string;
      executing: string;
      executed: string;
      execution_failed: string;
      stages_completed: string;
    };
    algorithm: {
      default: string;
      performance: string;
      set_as_default: string;
      default_updated: string;
    };
    expert: {
      accuracy: string;
      loss: string;
      samples_processed: string;
      create: string;
      creating: string;
      created: string;
      spawned_success: string;
    };
    improvement: {
      category: string;
      severity: string;
      human_review: string;
      requires: string;
      not_requires: string;
      validate: string;
      validated: string;
      validation_success: string;
      apply: string;
      applied: string;
      code_updated: string;
    };
    severity: {
      high: string;
      medium: string;
      low: string;
    };
    status: {
      proposed: string;
      validated: string;
      applied: string;
      error: string;
    };
  };
}

const translations: Record<Language, Translations> = {
  "pt-BR": {
    common: {
      error: "Erro",
      success: "Sucesso",
      loading: "Carregando...",
      loadingError: "Erro ao carregar dados",
      saveSuccess: "Salvo com sucesso",
      saveError: "Erro ao salvar",
      deleteSuccess: "Excluído com sucesso",
      deleteError: "Erro ao excluir",
      createSuccess: "Criado com sucesso",
      createError: "Erro ao criar",
      updateSuccess: "Atualizado com sucesso",
      updateError: "Erro ao atualizar",
      refresh: "Atualizar",
      active: "Ativo",
      inactive: "Inativo",
      created: "Criado em",
      statusText: "Status",
      status: {
        ready: "Pronto",
        processing: "Processando",
        failed: "Falhou",
      },
    },
    notFound: {
      title: "404 Página Não Encontrada",
      message: "Esqueceu de adicionar a página ao roteador?",
    },
    chat: {
      welcome: "Bem-vindo ao AION",
      welcomeDesc: "Simples e Sofisticado.",
      placeholder: "Digite sua mensagem...",
      thinking: "Pensando...",
      send: "Enviar",
      title: "AION",
      subtitle: "",
      newChat: "Nova Conversa",
      conversations: "Conversas",
      languageDetected: "Idioma detectado",
      switchedTo: "Alterado para",
      tooManyFiles: "Muitos arquivos",
      maxFilesAllowed: "Máximo de 5 arquivos permitidos",
      transcriptionFailed: "Transcrição falhou",
      transcriptionComplete: "Transcrição completa",
      audioTranscribed: "Áudio transcrito com sucesso!",
      transcriptionError: "Erro na transcrição",
      transcriptionRetry: "Falha ao transcrever áudio. Tente novamente.",
      microphoneAccessDenied: "Acesso ao microfone negado",
      allowMicrophoneAccess: "Permita acesso ao microfone para gravar áudio",
      recordAudio: "Gravar áudio",
      stopRecording: "Parar gravação",
      filesAttached: "Arquivo(s) anexado(s)",
      filesReady: "arquivo(s) pronto(s) para envio. A IA irá analisar o conteúdo.",
      error: "Erro",
      failedToInitialize: "Falha ao inicializar conversa",
      pleaseRefresh: "Por favor, atualize a página.",
      failedToLoad: "Falha ao carregar conversa",
      failedToCreate: "Falha ao criar nova conversa",
      failedToSend: "Falha ao enviar mensagem",
      noConversationActive: "Nenhuma conversa ativa",
      browserNoAudioSupport: "Seu navegador não suporta gravação de áudio",
      attachFilesHint: "Anexar arquivos (imagens, vídeos, documentos)",
      streamingOn: "Streaming ATIVO (tempo real)",
      streamingOff: "Streaming DESLIGADO",
      imageAlt: "Imagem",
    },
    admin: {
      title: "AION Admin",
      subtitle: "Painel de Controle & Políticas",
      backToChat: "Voltar ao Chat",
      
      tabs: {
        overview: "Visão Geral",
        telemetry: "Telemetria",
        tokenMonitoring: "Monitoramento de Tokens",
        history: "Histórico",
        costHistory: "Histórico de Custos",
        knowledgeBase: "Base de Conhecimento",
        gpuManagement: "Gerenciamento de GPUs",
        federatedTraining: "Treinamento Federado",
        autoEvolution: "Auto-Evolução",
        datasets: "Datasets",
        agents: "Agentes Especialistas",
        curation: "Curadoria",
        settings: "Configurações",
      },

      sidebar: {
        navigation: "Navegação",
        categories: {
          commandCenter: "Centro de Comando",
          analytics: "Analytics & Monitoramento",
          knowledgeVision: "Conhecimento & Visão",
          autonomousAI: "IA Autônoma",
          trainingFabric: "Fábrica de Treinamento",
          operations: "Operações",
          accessGovernance: "Governança de Acesso",
          systemConfig: "Configuração do Sistema",
        },
      },
      
      overview: {
        totalTokens: "Total de Tokens",
        totalCost: "Custo Total",
        kbSearches: "Buscas na KB",
        freeApis: "APIs Gratuitas",
        openai: "OpenAI",
        webSearches: "Buscas Web",
        kbDocuments: "Documentos KB",
        gpuWorkers: "Trabalhadores GPU",
        federatedJobs: "Jobs de Treinamento",
        allProviders: "Todos provedores",
        openaiOnly: "Apenas OpenAI",
        knowledgeBaseQueries: "Consultas Knowledge Base",
        groqGeminiHfOpenrouter: "Groq, Gemini, HF, OpenRouter",
        paidApiRequests: "Requisições API pagas",
        domainsSearched: "domínios pesquisados",
        duckduckgoProvider: "DuckDuckGo",
        torNetworkQueries: "consultas rede Tor",
        indexedKnowledge: "conhecimento indexado",
        healthyGpuWorkers: "GPUs ativas no pool",
        completedTrainingJobs: "jobs federados completados",
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
        imagesTab: "Gerenciar Conteúdo",
        
        actions: {
          addText: "Adicionar Texto",
          learnFromUrl: "Aprender de Link",
          searchWeb: "Pesquisar Web",
          uploadFiles: "Upload Arquivo(s)",
        },
        
        toasts: {
          knowledgeAdded: "Conhecimento adicionado com sucesso!",
          urlContentLearned: "Conteúdo do link aprendido com sucesso!",
          webSearchSuccess: "{{count}} novos conhecimentos adicionados!",
          searchLabel: "Pesquisa:",
          documentUpdated: "Documento atualizado!",
          documentRemoved: "Documento removido!",
          uploadingFiles: "Fazendo upload...",
          processingFiles: "Processando {{count}} arquivo(s)...",
          uploadCompleted: "Upload concluído!",
          filesProcessed: "{{count}} arquivo(s) processado(s) e indexado(s)",
          uploadError: "Erro no upload",
          processingFailed: "Falha ao processar arquivos",
          error: "Erro",
        },
        
        forms: {
          addText: {
            title: "Adicionar Novo Conhecimento",
            titlePlaceholder: "Título do conhecimento...",
            contentPlaceholder: "Escreva o conteúdo aqui...",
            saving: "Salvando...",
            save: "Salvar",
          },
          learnUrl: {
            title: "Aprender de um Link",
            description: "AION vai acessar o link e aprender todo o conteúdo",
            urlPlaceholder: "https://example.com/artigo",
            learning: "Aprendendo...",
            learnFromThisUrl: "Aprender deste Link",
          },
          webSearch: {
            title: "Pesquisar e Aprender da Web",
            description: "AION vai pesquisar na internet e indexar todo o conteúdo encontrado",
            searchPlaceholder: "Ex: Machine Learning fundamentals",
            searching: "Pesquisando...",
            searchAndLearn: "Pesquisar e Aprender",
          },
        },
        
        documents: {
          title: "Conhecimentos Armazenados",
          subtitle: "Gerenciar todos os conhecimentos da Knowledge Base",
          source: "Fonte",
          save: "Salvar",
          cancel: "Cancelar",
          confirmDelete: "Remover este conhecimento?",
        },
        
        states: {
          loading: "Carregando...",
          noDocuments: "Nenhum conhecimento encontrado. Adicione novos conhecimentos acima!",
        },
      },
      
      gpuManagement: {
        title: "Gerenciamento de GPUs",
        subtitle: "Gerencie workers de GPU e load balancing",
        activeWorkers: "Workers Ativos",
        totalGPUs: "Total de GPUs",
        totalRequests: "Total de Requisições",
        avgLatency: "Latência Média",
        avgLatencyMs: "Latência Média",
        errorRate: "Taxa de Erros",
        workersOnline: "workers online",
        requestsProcessed: "requisições processadas",
        avgResponseTime: "tempo médio de resposta",
        failedRequests: "requisições falhadas",
        registeredWorkers: "Workers Registrados",
        manageAllGpuWorkers: "Gerencie todos os workers de GPU",
        provider: "Provedor",
        account: "Conta",
        model: "Modelo",
        gpu: "GPU",
        status: "Status",
        health: "Saúde",
        tempo: "Tempo",
        requests: "Requisições",
        latency: "Latência",
        lastUsed: "Último Uso",
        actions: "Ações",
        healthy: "Saudável",
        unhealthy: "Não Saudável",
        online: "Online",
        offline: "Offline",
        pending: "Pendente",
        addWorker: "Adicionar GPU Worker",
        refresh: "Atualizar",
        edit: "Editar",
        delete: "Apagar",
        remove: "Remover",
        loading: "Carregando GPU workers...",
        noWorkers: "Nenhum GPU Worker Registrado",
        noWorkersDesc: "GPU workers aparecerão aqui assim que se registrarem via script Colab/Kaggle.",
        confirmDelete: "Tem certeza que deseja remover este worker?",
        toast: {
          workerRemoved: "GPU Worker Removido",
          workerRemovedDesc: "O GPU worker foi removido com sucesso do pool.",
          error: "Erro",
          errorRemovingWorker: "Falha ao remover GPU worker",
        },
        time: {
          never: "Nunca",
          na: "N/A",
          shuttingDown: "Desligando...",
          secondsAgo: "s atrás",
          minutesAgo: "m atrás",
          hoursAgo: "h atrás",
          hourUnit: "h",
          minuteUnit: "m",
          secondUnit: "s",
        },
      },
      
      addGpuWorker: {
        title: "Adicionar GPU Worker",
        description: "Provisione automaticamente notebooks Kaggle ou Colab como GPU workers",
        kaggleTab: "Kaggle (API)",
        colabTab: "Google Colab",
        kaggle: {
          title: "Kaggle Notebook (100% Automático)",
          subtitle: "30h/semana gratuito, P100 GPU, API oficial, zero manual",
          username: "Kaggle Username *",
          usernamePlaceholder: "seu-username",
          apiKey: "Kaggle API Key *",
          apiKeyPlaceholder: "Sua API Key (do kaggle.json)",
          apiKeyHelp: "Obtenha em: kaggle.com/settings → API → Create New Token",
          notebookName: "Nome do Notebook (opcional)",
          notebookNamePlaceholder: "aion-gpu-worker",
          howItWorks: "Como funciona:",
          step1: "API cria notebook automaticamente",
          step2: "Notebook executa script AION GPU worker",
          step3: "Worker se registra via ngrok (~2min)",
          step4: 'GPU aparece aqui com status "Healthy"',
          cancel: "Cancelar",
          provision: "Provisionar Kaggle",
          provisioning: "Provisionando...",
          requiredFields: "Campos obrigatórios",
          requiredFieldsDesc: "Username e API Key são obrigatórios",
          success: "Kaggle Worker Provisioning",
          successDesc: "Notebook criado com sucesso! GPU será registrada em ~2-3 minutos.",
          error: "Erro ao provisionar Kaggle",
          errorDesc: "Falha ao criar notebook Kaggle",
        },
        colab: {
          title: "Google Colab (Puppeteer)",
          subtitle: "GPU gratuita T4, orquestração via Puppeteer (sem API pública)",
          email: "Email do Google *",
          emailPlaceholder: "seu-email@gmail.com",
          password: "Senha do Google *",
          passwordPlaceholder: "Sua senha",
          passwordHelp: "⚠️ Credenciais armazenadas com criptografia AES-256",
          notebookUrl: "Notebook URL (opcional)",
          notebookUrlPlaceholder: "https://colab.research.google.com/drive/...",
          notebookUrlHelp: "Deixe vazio para criar novo notebook automaticamente",
          howItWorks: "⚡ Como funciona (Puppeteer):",
          step1: "Puppeteer faz login no Google (headless)",
          step2: "Cria/abre notebook no Colab",
          step3: "Executa script AION GPU worker",
          step4: "Worker se registra via ngrok (~3-5min)",
          estimatedTime: "⏱️ Tempo estimado: 3-5 minutos (login + provisioning)",
          cancel: "Cancelar",
          provision: "Provisionar Colab",
          provisioning: "Provisionando...",
          requiredFields: "Campos obrigatórios",
          requiredFieldsDesc: "Email e senha do Google são obrigatórios",
          success: "Colab Worker Provisioning",
          successDesc: "Notebook provisionado com sucesso! GPU será registrada em ~3-5 minutos.",
          error: "Erro ao provisionar Colab",
          errorDesc: "Falha ao orquestrar notebook Colab",
        },
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
        
        datasetSelector: {
          label: "Dataset para Treinamento",
          placeholder: "Selecionar dataset...",
          autoGenerated: "📚 Auto-Generated from KB (Recomendado)",
          highQuality: "⭐ KB High-Quality Only (score ≥ 80)",
          autoDesc: "Datasets auto-gerados usam conversas de alta qualidade do seu Knowledge Base para aprendizado contínuo",
        },
        
        jobDetails: {
          progress: "Progresso",
          steps: "passos",
          globalLoss: "Global Loss",
          bestLoss: "Best Loss",
          completedChunks: "Chunks Concluídos",
          workers: "workers",
          viewDetails: "Ver Detalhes",
          pause: "Pausar",
          resume: "Retomar",
          na: "N/A",
        },
        
        datasetManagement: {
          title: "Training Datasets",
          subtitle: "Upload e gerenciamento de datasets para treinamento federado",
          uploadButton: "Upload Dataset",
          noDatasets: "Nenhum dataset enviado ainda",
          noDatasetsDesc: "Envie um dataset para começar o treinamento",
          type: "Tipo",
          examples: "Exemplos",
          size: "Tamanho",
          mbUnit: "MB",
          delete: "Apagar",
        },
        
        toast: {
          datasetRequired: "⚠️ Dataset Obrigatório",
          datasetRequiredDesc: "Por favor, selecione um dataset para treinamento",
          generatingDataset: "🔄 Gerando Dataset do KB...",
          generatingDatasetDesc: "Coletando conversas de alta qualidade para treinamento",
          datasetGenerated: "✅ Dataset Gerado!",
          datasetGeneratedDesc: "exemplos de treinamento criados (score médio:",
          datasetGenerationFailed: "❌ Falha ao Gerar Dataset",
          nameRequired: "⚠️ Nome Obrigatório",
          nameRequiredDesc: "Por favor, insira um nome para o dataset",
          fileRequired: "⚠️ Arquivo Obrigatório",
          fileRequiredDesc: "Por favor, selecione um arquivo para upload",
          datasetUploaded: "✅ Dataset Enviado",
          datasetUploadedDesc: "Dataset processado com sucesso",
          uploadFailed: "❌ Upload Falhou",
          datasetDeleted: "✅ Dataset Apagado",
          deleteFailed: "❌ Falha ao Apagar",
        },
      },
      
      behavior: {
        title: "Comportamento da IA",
        description: "Ajuste a personalidade e estilo de resposta com 7 características configuráveis",
        verbosity: "Verbosidade",
        verbosityDesc: "0% = Respostas curtas (1-2 frases) | 100% = Respostas detalhadas e completas",
        formality: "Formalidade",
        formalityDesc: "0% = Casual e amigável | 100% = Formal e profissional",
        creativity: "Criatividade",
        creativityDesc: "0% = Somente fatos objetivos | 100% = Usa metáforas, analogias e linguagem criativa",
        precision: "Precisão",
        precisionDesc: "0% = Números aproximados e estimativas | 100% = Números exatos e fontes citadas",
        persuasiveness: "Persuasão",
        persuasivenessDesc: "0% = Apresenta fatos neutros | 100% = Usa técnicas persuasivas e argumentos fortes",
        empathy: "Empatia",
        empathyDesc: "0% = Objetivo e factual | 100% = Mostra empatia e consideração emocional",
        enthusiasm: "Entusiasmo",
        enthusiasmDesc: "0% = Tom calmo e reservado | 100% = Energia alta e linguagem expressiva!",
        systemPrompt: "System Prompt",
        systemPromptDesc: "Instruções base para o comportamento da IA",
        systemPromptPlaceholder: "Digite o system prompt...",
        viewFullPrompt: "Ver Prompt Completo",
        previewModal: {
          title: "Prompt Completo (Enviado para as IAs)",
          description: "Este é o prompt REAL que o AION envia para OpenAI, Groq, Gemini e outras APIs. Inclui suas configurações customizadas + as 7 características do equalizador.",
          loading: "Carregando...",
          close: "Fechar",
          characters: "caracteres",
        },
      },
      
      settings: {
        title: "Configurações",
        subtitle: "Configure políticas, comportamento e preferências do sistema",
        timezone: {
          title: "Fuso Horário",
          description: "Selecione seu fuso horário para exibição correta de datas e horários",
          select: "Selecionar Fuso Horário",
          currentTime: "Horário atual",
          save: "Salvar",
          saving: "Salvando...",
          saved: "Fuso horário salvo com sucesso!",
          saveError: "Erro ao salvar fuso horário",
        },
      },
      
      userManagement: {
        title: "Gerenciamento de Usuários",
        subtitle: "Gerencie usuários do sistema e suas funções",
        addUser: "Adicionar Usuário",
        alertInfo: "Usuários com tipo \"dashboard\" podem acessar o painel administrativo. Usuários com tipo \"chat\" podem apenas usar a interface de chat.",
        usersCount: "Usuários",
        loading: "Carregando usuários...",
        noUsers: "Nenhum usuário encontrado.",
        noUsersDesc: "Crie seu primeiro usuário para começar.",
        deleteConfirm: "Tem certeza de que deseja excluir este usuário?",
        table: {
          name: "Nome",
          email: "E-mail",
          type: "Tipo",
          roles: "Funções",
          created: "Criado em",
          actions: "Ações",
          noRoles: "Sem funções",
        },
        dialog: {
          createTitle: "Criar Novo Usuário",
          editTitle: "Editar Usuário",
          name: "Nome",
          namePlaceholder: "João Silva",
          email: "E-mail",
          emailPlaceholder: "joao@exemplo.com",
          password: "Senha",
          passwordPlaceholder: "••••••••",
          passwordEditNote: "Senha (deixe em branco para manter a atual)",
          userType: "Tipo de Acesso",
          userTypeAccessLabel: "Permissões de Acesso",
          userTypeAccessDescription: "Selecione quais interfaces o usuário pode acessar",
          userTypeDashboard: "Acesso ao Painel Administrativo",
          userTypeChat: "Acesso ao Chat",
          userTypeBoth: "Ambos",
          userTypeNone: "Nenhum",
          userTypeRequired: "Selecione pelo menos uma permissão de acesso",
          cancel: "Cancelar",
          create: "Criar Usuário",
          creating: "Criando...",
          update: "Atualizar Usuário",
          updating: "Atualizando...",
        },
        toasts: {
          createSuccess: "Usuário criado com sucesso",
          createError: "Falha ao criar usuário",
          updateSuccess: "Usuário atualizado com sucesso",
          updateError: "Falha ao atualizar usuário",
          deleteSuccess: "Usuário excluído com sucesso",
          deleteError: "Falha ao excluir usuário",
        },
      },
      
      permissions: {
        title: "Gerenciamento de Permissões",
        description: "Gerencie permissões de funções para controle de acesso granular",
        matrix: {
          title: "Matriz de Permissões",
          permissionColumn: "Permissão",
          noPermissions: "Nenhuma permissão encontrada",
        },
        validation: {
          nameRequired: "Nome é obrigatório",
          moduleRequired: "Módulo é obrigatório",
          submoduleRequired: "Submódulo é obrigatório",
          actionsRequired: "Selecione pelo menos uma ação",
        },
        placeholders: {
          selectModule: "Selecione um módulo",
          selectModuleFirst: "Selecione um módulo primeiro",
          selectSubmodule: "Selecione um submódulo",
        },
        toasts: {
          assignSuccess: "Permissão atribuída com sucesso",
          assignError: "Falha ao atribuir permissão",
          revokeSuccess: "Permissão revogada com sucesso",
          revokeError: "Falha ao revogar permissão",
          createSuccess: "Permissão criada com sucesso",
          createError: "Erro ao criar permissão",
          updateSuccess: "Permissão atualizada com sucesso",
          updateError: "Erro ao atualizar permissão",
          deleteSuccess: "Permissão excluída com sucesso",
          deleteError: "Erro ao excluir permissão",
        },
        crud: {
          createButton: "Nova Permissão",
          createTitle: "Nova Permissão",
          editTitle: "Editar Permissão",
          deleteTitle: "Excluir Permissão",
          deleteConfirm: "Tem certeza que deseja excluir esta permissão?",
          codeLabel: "Código",
          nameLabel: "Nome",
          moduleLabel: "Módulo",
          submoduleLabel: "Submódulo",
          actionsLabel: "Ações",
          descriptionLabel: "Descrição",
          codePlaceholder: "ex: kb:images:read",
          namePlaceholder: "ex: Visualizar Imagens KB",
          modulePlaceholder: "ex: kb",
          descriptionPlaceholder: "Descrição da permissão (opcional)",
          usageWarning: "Esta ação removerá todas as atribuições desta permissão!",
          usageInfo: "Esta permissão está sendo usada em:",
          rolesUsing: "papéis (roles)",
          usersUsing: "usuários",
          creating: "Criando...",
          create: "Criar",
          saving: "Salvando...",
          save: "Salvar",
          deleting: "Excluindo...",
          delete: "Excluir",
          cancel: "Cancelar",
        },
        helpers: {
          selectSubmoduleToSeeActions: "Selecione um submódulo para ver as ações disponíveis",
          codesPreview: "Códigos que serão gerados:",
          permissionInUse: "⚠️ Permissão em uso:",
        },
      },
      
      // User Management - Extended
      userPermissions: {
        title: "Permissões Específicas do Usuário",
        description: "Estas permissões são adicionadas ou removidas para este usuário específico, além das permissões herdadas do papel (role).",
      },
      
      agents: {
        title: "Agentes Especialistas",
        subtitle: "Gerencie agentes e sub-agentes especializados",
        list: "Lista",
        createAgent: "Criar Agente",
        createSubAgent: "Criar Sub-Agente",
        createSubagent: "Criar Sub-Agente",
        hierarchy: "Hierarquia",
        activeAgents: "Agentes Ativos",
        agentsInSystem: "agentes no sistema",
        noAgents: "Nenhum agente cadastrado",
        noAgentsDesc: "Crie seu primeiro agente especializado",
        loading: "Carregando agentes...",
        name: "Nome",
        description: "Descrição",
        namespace: "Namespace",
        tier: "Tipo",
        agent: "Agente",
        subAgent: "Sub-Agente",
        actions: "Ações",
        edit: "Editar",
        delete: "Deletar",
        confirmDelete: "Deletar agente?",
        confirmDeleteDesc: "Esta ação não pode ser desfeita.",
        cancel: "Cancelar",
        createDialog: {
          title: "Criar Novo Agente",
          subtitle: "Preencha apenas nome e descrição. O sistema gera o slug automaticamente.",
          namePlaceholder: "Nome do agente (ex: Analista Financeiro)",
          descriptionPlaceholder: "Descrição das responsabilidades...",
          create: "Criar",
          creating: "Criando...",
        },
        editDialog: {
          title: "Editar Agente",
          subtitle: "Atualize as informações do agente",
          save: "Salvar",
          saving: "Salvando...",
        },
        toast: {
          created: "Agente criado com sucesso!",
          updated: "Agente atualizado!",
          deleted: "Agente removido!",
        },
      },
      
      datasets: {
        title: "Datasets de Treinamento",
        subtitle: "Gerencie datasets compilados e dados de treinamento",
      },
      
      curation: {
        title: "Fila de Curadoria",
        subtitle: "Revise e aprove conteúdo antes da indexação",
        pending: "Pendente",
        approved: "Aprovado",
        rejected: "Rejeitado",
        history: "Histórico",
        noPending: "Nenhum item pendente",
        noPendingDesc: "Todos os itens foram revisados",
        review: "Revisar",
        approve: "Aprovar",
        reject: "Rejeitar",
        bulkApprove: "Aprovar Selecionados",
        bulkReject: "Rejeitar Selecionados",
        selectedItems: "itens selecionados",
        approveAll: "Aprovar Todos",
        rejectAll: "Rejeitar Todos",
        confirmApprove: "Aprovar este item?",
        confirmReject: "Rejeitar este item?",
        rejectNote: "Motivo da rejeição",
        rejectNotePlaceholder: "Por que este conteúdo foi rejeitado?",
        submittedBy: "Enviado por",
        reviewedBy: "Revisado por",
        note: "Nota",
        attachments: "Anexos",
        viewAttachment: "Ver anexo",
        all: "Todos",
        pages: "Páginas",
        images: "Imagens",
      },
      
      jobs: {
        title: "Jobs de Crawling",
        subtitle: "Monitore jobs assíncronos de deep crawling em tempo real",
        noJobs: "Nenhum job encontrado",
        jobId: "Job ID",
        created: "Criado",
        started: "Iniciado",
        completed: "Concluído",
        progress: "Progresso",
        items: "itens",
        currentItem: "Item atual",
        namespace: "Namespace",
        maxDepth: "Profundidade",
        maxPages: "Máx. páginas",
        actionSuccess: "Ação executada com sucesso",
        status: {
          pending: "Pendente",
          running: "Em execução",
          paused: "Pausado",
          completed: "Concluído",
          failed: "Falhou",
          cancelled: "Cancelado",
        },
        filters: {
          all: "Todos",
          active: "Ativos",
          completed: "Concluídos",
          failed: "Falhados",
        },
      },
      
      imageSearch: {
        title: "Busca de Imagens",
        subtitle: "Busca semântica usando descrições geradas pelo Vision AI",
        searchPlaceholder: "Descreva o que procura (ex: 'logo azul', 'pessoa sorrindo', 'paisagem natural')...",
        search: "Buscar",
        searching: "Buscando...",
        clear: "Limpar",
        results: "Resultados da Busca",
        allImages: "Todas as Imagens",
        imagesIndexed: "imagens indexadas",
        imagesFound: "imagens encontradas para",
        imagesInKb: "imagens na base de conhecimento",
        noImages: "Nenhuma imagem encontrada",
        noImagesDesc: "Tente usar termos diferentes na busca",
        uploadPrompt: "Faça upload de imagens através da página de Knowledge Base",
        remove: "Remover",
        confirmRemove: "Remover esta imagem da KB?",
        removed: "Imagem removida com sucesso",
        searchError: "Erro na busca",
        loading: "Carregando imagens...",
      },
      
      vision: {
        title: "Vision System",
        subtitle: "Monitoramento de quota em tempo real através de 5 provedores",
        quotaMonitoring: "Monitoramento de Quota",
        quotaDesc: "Status de uso em tempo real dos provedores de visão",
        providers: "Provedores Configurados",
        providersDesc: "Informações e status dos provedores de Vision AI",
        usage: "Uso",
        limit: "Limite",
        available: "Disponível",
        unavailable: "Indisponível",
        active: "Ativo",
        missingKey: "Chave Ausente",
        totalRequests: "Total de Requisições",
        successRate: "Taxa de Sucesso",
        tier: "Tier",
        priority: "Prioridade",
        features: "Recursos",
        model: "Modelo",
        dailyLimit: "Limite Diário",
        unlimited: "Ilimitado",
        loading: "Carregando status...",
        errorLoading: "Erro ao Carregar Provedores",
        errorLoadingDesc: "Não foi possível carregar informações dos provedores",
        used: "usado",
        providersTitle: "Provedores de Visão AI",
        reqPerDay: "req/dia",
        statsTitle: "Estatísticas de Uso (Últimos 7 Dias)",
        statsDesc: "Histórico detalhado de requisições por provedor",
        noData: "Nenhum dado disponível",
        total: "Total",
        success: "Sucesso",
        failed: "Falhou",
        rate: "Taxa",
      },
      
      namespaces: {
        title: "Namespaces",
        subtitle: "Gerencie a hierarquia de namespaces da base de conhecimento",
        createRoot: "Criar Namespace Raiz",
        createSub: "Criar Sub-namespace",
        createRootDesc: "Crie um novo namespace raiz para organizar conhecimento por área",
        createSubDesc: "Crie um sub-namespace dentro de uma área existente",
        noNamespaces: "Nenhum namespace encontrado",
        noNamespacesDesc: "Crie seu primeiro namespace",
        name: "Nome",
        displayName: "Nome de Exibição",
        description: "Descrição",
        type: "Tipo",
        root: "Raiz",
        sub: "Sub",
        parent: "Pai",
        actions: "Ações",
        edit: "Editar",
        delete: "Deletar",
        confirmDelete: "Deletar namespace?",
        cancel: "Cancelar",
        create: "Criar Namespace",
        creating: "Criando...",
        save: "Salvar",
        saving: "Salvando...",
        rootNameLabel: "Nome do Namespace *",
        fullNameLabel: "Nome Completo *",
        namePlaceholder: "ex: tech.ai.ml",
        rootPlaceholder: "Ex: atendimento, financas",
        displayNamePlaceholder: "ex: Machine Learning",
        descriptionPlaceholder: "Descreva o tipo de conteúdo deste namespace...",
        contentPlaceholder: "Cole textos ou documentos para o Agente Curador indexar...",
        rootNameExample: "Ex: projetos, vendas, documentacao",
        subNameExample: "Ex: financas/impostos, tech/apis",
        rootNameHint: "Nome único sem '/' para namespace raiz",
        subNameHint: "Formato: namespace-pai/sub-namespace",
        selectParent: "Selecionar namespace pai",
        editCustomVersion: "Criar Versão Customizada",
        editNamespace: "Editar Namespace",
        validation: {
          nameRequired: "Nome obrigatório",
          nameRequiredDesc: "Por favor, insira um nome para o namespace",
          invalidRootFormat: "Formato inválido para namespace raiz",
          rootNoSlash: "Namespace raiz não pode conter '/'",
          parentRequired: "Namespace pai obrigatório",
          selectParentDesc: "Selecione o namespace pai para criar um sub-namespace",
          invalidFormat: "Formato inválido",
          subFormatError: "Sub-namespace deve estar no formato pai/filho",
        },
        toast: {
          created: "Namespace criado!",
          updated: "Namespace atualizado!",
          deleted: "Namespace removido!",
          contentQueued: "Conteúdo adicionado à fila de curadoria!",
          indexError: "Erro ao indexar conteúdo",
          unknownError: "Erro desconhecido",
          customVersionCreated: "Versão customizada criada!",
        },
      },
      
      lifecycle: {
        title: "Lifecycle Policies",
        subtitle: "Políticas de retenção e limpeza automática de dados",
        conversations: "Conversas",
        conversationsDesc: "Políticas de retenção para conversas do chat",
        training: "Training Data",
        trainingDesc: "Políticas de retenção para dados de treinamento",
        gpu: "GPU Workers",
        gpuDesc: "Políticas de limpeza para workers GPU obsoletos",
        enabled: "Habilitado",
        disabled: "Desabilitado",
        archive: "Arquivo",
        purge: "Purga",
        retention: "Retenção",
        months: "meses",
        years: "anos",
        days: "dias",
        save: "Salvar Alterações",
        saving: "Salvando...",
        saved: "Políticas atualizadas",
        unsavedChanges: "Você tem alterações não salvas",
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
    
    meta: {
      dashboard: {
        title: "Meta-Learning",
        subtitle: "Sistema autônomo de aprendizado de algoritmos e auto-evolução",
      },
      tabs: {
        algorithms: "Algoritmos",
        experts: "Experts",
        improvements: "Melhorias",
      },
      loading: {
        algorithms: "Carregando algoritmos aprendidos...",
        experts: "Carregando experts adaptativos...",
        improvements: "Carregando melhorias de código...",
      },
      empty: {
        algorithms: "Nenhum algoritmo aprendido ainda",
        experts: "Nenhum expert ativo",
        improvements: "Nenhuma melhoria proposta",
      },
      pipeline: {
        execute: "Executar Pipeline",
        executing: "Executando...",
        executed: "Pipeline executado!",
        execution_failed: "Falha na execução",
        stages_completed: "estágios completados",
      },
      algorithm: {
        default: "Padrão",
        performance: "Performance",
        set_as_default: "Definir como Padrão",
        default_updated: "Algoritmo padrão atualizado!",
      },
      expert: {
        accuracy: "Acurácia",
        loss: "Loss",
        samples_processed: "Amostras Processadas",
        create: "Criar Expert",
        creating: "Criando...",
        created: "Expert criado!",
        spawned_success: "Novo expert spawned com sucesso!",
      },
      improvement: {
        category: "Categoria",
        severity: "Severidade",
        human_review: "Revisão Humana",
        requires: "Requer",
        not_requires: "Não Requer",
        validate: "Validar",
        validated: "Validado",
        validation_success: "Melhoria validada!",
        apply: "Aplicar",
        applied: "Aplicado",
        code_updated: "Código atualizado com sucesso!",
      },
      severity: {
        high: "Alta",
        medium: "Média",
        low: "Baixa",
      },
      status: {
        proposed: "Proposto",
        validated: "Validado",
        applied: "Aplicado",
        error: "Erro",
      },
    },
  },
  
  "en-US": {
    common: {
      error: "Error",
      success: "Success",
      loading: "Loading...",
      loadingError: "Error loading data",
      saveSuccess: "Saved successfully",
      saveError: "Error saving",
      deleteSuccess: "Deleted successfully",
      deleteError: "Error deleting",
      createSuccess: "Created successfully",
      createError: "Error creating",
      updateSuccess: "Updated successfully",
      updateError: "Error updating",
      refresh: "Refresh",
      active: "Active",
      inactive: "Inactive",
      created: "Created at",
      statusText: "Status",
      status: {
        ready: "Ready",
        processing: "Processing",
        failed: "Failed",
      },
    },
    notFound: {
      title: "404 Page Not Found",
      message: "Did you forget to add the page to the router?",
    },
    chat: {
      welcome: "Welcome to AION",
      welcomeDesc: "Simple and Sophisticated.",
      placeholder: "Type your message...",
      thinking: "Thinking...",
      send: "Send",
      title: "AION",
      subtitle: "",
      newChat: "New Chat",
      conversations: "Conversations",
      languageDetected: "Language detected",
      switchedTo: "Switched to",
      tooManyFiles: "Too many files",
      maxFilesAllowed: "Maximum of 5 files allowed",
      transcriptionFailed: "Transcription failed",
      transcriptionComplete: "Transcription complete",
      audioTranscribed: "Audio transcribed successfully!",
      transcriptionError: "Transcription error",
      transcriptionRetry: "Failed to transcribe audio. Please try again.",
      microphoneAccessDenied: "Microphone access denied",
      allowMicrophoneAccess: "Please allow microphone access to record audio",
      recordAudio: "Record audio",
      stopRecording: "Stop recording",
      filesAttached: "File(s) attached",
      filesReady: "file(s) ready to send. AI will analyze the content.",
      error: "Error",
      failedToInitialize: "Failed to initialize conversation",
      pleaseRefresh: "Please refresh the page.",
      failedToLoad: "Failed to load conversation",
      failedToCreate: "Failed to create new conversation",
      failedToSend: "Failed to send message",
      noConversationActive: "No conversation active",
      browserNoAudioSupport: "Your browser does not support audio recording",
      attachFilesHint: "Attach files (images, videos, documents)",
      streamingOn: "Streaming ON (real-time)",
      streamingOff: "Streaming OFF",
      imageAlt: "Image",
    },
    admin: {
      title: "AION Admin",
      subtitle: "Control Panel & Policies",
      backToChat: "Back to Chat",
      
      tabs: {
        overview: "Overview",
        telemetry: "Telemetry",
        tokenMonitoring: "Token Monitoring",
        history: "History",
        costHistory: "Cost History",
        knowledgeBase: "Knowledge Base",
        gpuManagement: "GPU Management",
        federatedTraining: "Federated Training",
        autoEvolution: "Auto-Evolution",
        datasets: "Datasets",
        agents: "Specialist Agents",
        curation: "Curation",
        settings: "Settings",
      },

      sidebar: {
        navigation: "Navigation",
        categories: {
          commandCenter: "Command Center",
          analytics: "Analytics & Monitoring",
          knowledgeVision: "Knowledge & Vision",
          autonomousAI: "Autonomous AI",
          trainingFabric: "Training Fabric",
          operations: "Operations",
          accessGovernance: "Access Governance",
          systemConfig: "System Configuration",
        },
      },
      
      overview: {
        totalTokens: "Total Tokens",
        totalCost: "Total Cost",
        kbSearches: "KB Searches",
        freeApis: "Free APIs",
        openai: "OpenAI",
        webSearches: "Web Searches",
        kbDocuments: "KB Documents",
        gpuWorkers: "GPU Workers",
        federatedJobs: "Training Jobs",
        allProviders: "All providers",
        openaiOnly: "OpenAI only",
        knowledgeBaseQueries: "Knowledge Base queries",
        groqGeminiHfOpenrouter: "Groq, Gemini, HF, OpenRouter",
        paidApiRequests: "Paid API requests",
        domainsSearched: "domains searched",
        duckduckgoProvider: "DuckDuckGo",
        torNetworkQueries: "Tor network queries",
        indexedKnowledge: "indexed knowledge",
        healthyGpuWorkers: "active GPUs in pool",
        completedTrainingJobs: "completed federated jobs",
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
        imagesTab: "Manage Content",
        
        actions: {
          addText: "Add Text",
          learnFromUrl: "Learn from URL",
          searchWeb: "Search Web",
          uploadFiles: "Upload File(s)",
        },
        
        toasts: {
          knowledgeAdded: "Knowledge added successfully!",
          urlContentLearned: "URL content learned successfully!",
          webSearchSuccess: "{{count}} new knowledge added!",
          searchLabel: "Search:",
          documentUpdated: "Document updated!",
          documentRemoved: "Document removed!",
          uploadingFiles: "Uploading files...",
          processingFiles: "Processing {{count}} file(s)...",
          uploadCompleted: "Upload completed!",
          filesProcessed: "{{count}} file(s) processed and indexed",
          uploadError: "Upload error",
          processingFailed: "Failed to process files",
          error: "Error",
        },
        
        forms: {
          addText: {
            title: "Add New Knowledge",
            titlePlaceholder: "Knowledge title...",
            contentPlaceholder: "Write content here...",
            saving: "Saving...",
            save: "Save",
          },
          learnUrl: {
            title: "Learn from a URL",
            description: "AION will access the link and learn all content",
            urlPlaceholder: "https://example.com/article",
            learning: "Learning...",
            learnFromThisUrl: "Learn from this URL",
          },
          webSearch: {
            title: "Search and Learn from Web",
            description: "AION will search the internet and index all found content",
            searchPlaceholder: "Ex: Machine Learning fundamentals",
            searching: "Searching...",
            searchAndLearn: "Search and Learn",
          },
        },
        
        documents: {
          title: "Stored Knowledge",
          subtitle: "Manage all Knowledge Base knowledge",
          source: "Source",
          save: "Save",
          cancel: "Cancel",
          confirmDelete: "Remove this knowledge?",
        },
        
        states: {
          loading: "Loading...",
          noDocuments: "No knowledge found. Add new knowledge above!",
        },
      },
      
      gpuManagement: {
        title: "GPU Management",
        subtitle: "Manage GPU workers and load balancing",
        activeWorkers: "Active Workers",
        totalGPUs: "Total GPUs",
        totalRequests: "Total Requests",
        avgLatency: "Avg Latency",
        avgLatencyMs: "Avg Latency",
        errorRate: "Error Rate",
        workersOnline: "workers online",
        requestsProcessed: "requests processed",
        avgResponseTime: "avg response time",
        failedRequests: "failed requests",
        registeredWorkers: "Registered Workers",
        manageAllGpuWorkers: "Manage all GPU workers",
        provider: "Provider",
        account: "Account",
        model: "Model",
        gpu: "GPU",
        status: "Status",
        health: "Health",
        tempo: "Time",
        requests: "Requests",
        latency: "Latency",
        lastUsed: "Last Used",
        actions: "Actions",
        healthy: "Healthy",
        unhealthy: "Unhealthy",
        online: "Online",
        offline: "Offline",
        pending: "Pending",
        addWorker: "Add GPU Worker",
        refresh: "Refresh",
        edit: "Edit",
        delete: "Delete",
        remove: "Remove",
        loading: "Loading GPU workers...",
        noWorkers: "No GPU Workers Registered",
        noWorkersDesc: "GPU workers will appear here once they register via the Colab/Kaggle script.",
        confirmDelete: "Are you sure you want to remove this worker?",
        toast: {
          workerRemoved: "GPU Worker Removed",
          workerRemovedDesc: "The GPU worker has been successfully removed from the pool.",
          error: "Error",
          errorRemovingWorker: "Failed to remove GPU worker",
        },
        time: {
          never: "Never",
          na: "N/A",
          shuttingDown: "Shutting down...",
          secondsAgo: "s ago",
          minutesAgo: "m ago",
          hoursAgo: "h ago",
          hourUnit: "h",
          minuteUnit: "m",
          secondUnit: "s",
        },
      },
      
      addGpuWorker: {
        title: "Add GPU Worker",
        description: "Automatically provision Kaggle or Colab notebooks as GPU workers",
        kaggleTab: "Kaggle (API)",
        colabTab: "Google Colab",
        kaggle: {
          title: "Kaggle Notebook (100% Automated)",
          subtitle: "30h/week free, P100 GPU, official API, zero manual work",
          username: "Kaggle Username *",
          usernamePlaceholder: "your-username",
          apiKey: "Kaggle API Key *",
          apiKeyPlaceholder: "Your API Key (from kaggle.json)",
          apiKeyHelp: "Get it from: kaggle.com/settings → API → Create New Token",
          notebookName: "Notebook Name (optional)",
          notebookNamePlaceholder: "aion-gpu-worker",
          howItWorks: "How it works:",
          step1: "API creates notebook automatically",
          step2: "Notebook runs AION GPU worker script",
          step3: "Worker registers via ngrok (~2min)",
          step4: 'GPU appears here with "Healthy" status',
          cancel: "Cancel",
          provision: "Provision Kaggle",
          provisioning: "Provisioning...",
          requiredFields: "Required fields",
          requiredFieldsDesc: "Username and API Key are required",
          success: "Kaggle Worker Provisioning",
          successDesc: "Notebook created successfully! GPU will be registered in ~2-3 minutes.",
          error: "Error provisioning Kaggle",
          errorDesc: "Failed to create Kaggle notebook",
        },
        colab: {
          title: "Google Colab (Puppeteer)",
          subtitle: "Free T4 GPU, orchestration via Puppeteer (no public API)",
          email: "Google Email *",
          emailPlaceholder: "your-email@gmail.com",
          password: "Google Password *",
          passwordPlaceholder: "Your password",
          passwordHelp: "⚠️ Credentials stored with AES-256 encryption",
          notebookUrl: "Notebook URL (optional)",
          notebookUrlPlaceholder: "https://colab.research.google.com/drive/...",
          notebookUrlHelp: "Leave empty to create new notebook automatically",
          howItWorks: "⚡ How it works (Puppeteer):",
          step1: "Puppeteer logs into Google (headless)",
          step2: "Creates/opens notebook in Colab",
          step3: "Runs AION GPU worker script",
          step4: "Worker registers via ngrok (~3-5min)",
          estimatedTime: "⏱️ Estimated time: 3-5 minutes (login + provisioning)",
          cancel: "Cancel",
          provision: "Provision Colab",
          provisioning: "Provisioning...",
          requiredFields: "Required fields",
          requiredFieldsDesc: "Email and Google password are required",
          success: "Colab Worker Provisioning",
          successDesc: "Notebook provisioned successfully! GPU will be registered in ~3-5 minutes.",
          error: "Error provisioning Colab",
          errorDesc: "Failed to orchestrate Colab notebook",
        },
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
        
        datasetSelector: {
          label: "Training Dataset",
          placeholder: "Select dataset...",
          autoGenerated: "📚 Auto-Generated from KB (Recommended)",
          highQuality: "⭐ KB High-Quality Only (score ≥ 80)",
          autoDesc: "Auto-generated datasets use high-quality conversations from your Knowledge Base for continuous learning",
        },
        
        jobDetails: {
          progress: "Progress",
          steps: "steps",
          globalLoss: "Global Loss",
          bestLoss: "Best Loss",
          completedChunks: "Completed Chunks",
          workers: "workers",
          viewDetails: "View Details",
          pause: "Pause",
          resume: "Resume",
          na: "N/A",
        },
        
        datasetManagement: {
          title: "Training Datasets",
          subtitle: "Upload and manage datasets for federated training",
          uploadButton: "Upload Dataset",
          noDatasets: "No datasets uploaded yet",
          noDatasetsDesc: "Upload a dataset to start training",
          type: "Type",
          examples: "Examples",
          size: "Size",
          mbUnit: "MB",
          delete: "Delete",
        },
        
        toast: {
          datasetRequired: "⚠️ Dataset Required",
          datasetRequiredDesc: "Please select a dataset for training",
          generatingDataset: "🔄 Generating Dataset from KB...",
          generatingDatasetDesc: "Collecting high-quality conversations for training",
          datasetGenerated: "✅ Dataset Generated!",
          datasetGeneratedDesc: "training examples created (avg score:",
          datasetGenerationFailed: "❌ Dataset Generation Failed",
          nameRequired: "⚠️ Name Required",
          nameRequiredDesc: "Please enter a dataset name",
          fileRequired: "⚠️ File Required",
          fileRequiredDesc: "Please select a file to upload",
          datasetUploaded: "✅ Dataset Uploaded",
          datasetUploadedDesc: "Dataset processed successfully",
          uploadFailed: "❌ Upload Failed",
          datasetDeleted: "✅ Dataset Deleted",
          deleteFailed: "❌ Delete Failed",
        },
      },
      
      behavior: {
        title: "AI Behavior",
        description: "Adjust personality and response style with 7 configurable traits",
        verbosity: "Verbosity",
        verbosityDesc: "0% = Short answers (1-2 sentences) | 100% = Detailed and comprehensive responses",
        formality: "Formality",
        formalityDesc: "0% = Casual and friendly | 100% = Formal and professional",
        creativity: "Creativity",
        creativityDesc: "0% = Only objective facts | 100% = Uses metaphors, analogies and creative language",
        precision: "Precision",
        precisionDesc: "0% = Approximate numbers and estimates | 100% = Exact numbers and cited sources",
        persuasiveness: "Persuasiveness",
        persuasivenessDesc: "0% = Presents neutral facts | 100% = Uses persuasive techniques and strong arguments",
        empathy: "Empathy",
        empathyDesc: "0% = Objective and factual | 100% = Shows empathy and emotional consideration",
        enthusiasm: "Enthusiasm",
        enthusiasmDesc: "0% = Calm and reserved tone | 100% = High energy and expressive language!",
        systemPrompt: "System Prompt",
        systemPromptDesc: "Base instructions for AI behavior",
        systemPromptPlaceholder: "Enter system prompt...",
        viewFullPrompt: "View Full Prompt",
        previewModal: {
          title: "Full Prompt (Sent to AI APIs)",
          description: "This is the REAL prompt that AION sends to OpenAI, Groq, Gemini and other APIs. Includes your custom settings + the 7 equalizer characteristics.",
          loading: "Loading...",
          close: "Close",
          characters: "characters",
        },
      },
      
      settings: {
        title: "Settings",
        subtitle: "Configure policies, behavior and system preferences",
        timezone: {
          title: "Timezone",
          description: "Select your timezone for correct date and time display",
          select: "Select Timezone",
          currentTime: "Current time",
          save: "Save",
          saving: "Saving...",
          saved: "Timezone saved successfully!",
          saveError: "Error saving timezone",
        },
      },
      
      userManagement: {
        title: "User Management",
        subtitle: "Manage system users and their roles",
        addUser: "Add User",
        alertInfo: "Users with \"dashboard\" type can access the admin panel. Users with \"chat\" type can only use the chat interface.",
        usersCount: "Users",
        loading: "Loading users...",
        noUsers: "No users found.",
        noUsersDesc: "Create your first user to get started.",
        deleteConfirm: "Are you sure you want to delete this user?",
        table: {
          name: "Name",
          email: "Email",
          type: "Type",
          roles: "Roles",
          created: "Created",
          actions: "Actions",
          noRoles: "No roles",
        },
        dialog: {
          createTitle: "Create New User",
          editTitle: "Edit User",
          name: "Name",
          namePlaceholder: "John Doe",
          email: "Email",
          emailPlaceholder: "john@example.com",
          password: "Password",
          passwordPlaceholder: "••••••••",
          passwordEditNote: "Password (leave blank to keep current)",
          userType: "Access Type",
          userTypeAccessLabel: "Access Permissions",
          userTypeAccessDescription: "Select which interfaces the user can access",
          userTypeDashboard: "Access to Admin Dashboard",
          userTypeChat: "Access to Chat",
          userTypeBoth: "Both",
          userTypeNone: "None",
          userTypeRequired: "Select at least one access permission",
          cancel: "Cancel",
          create: "Create User",
          creating: "Creating...",
          update: "Update User",
          updating: "Updating...",
        },
        toasts: {
          createSuccess: "User created successfully",
          createError: "Failed to create user",
          updateSuccess: "User updated successfully",
          updateError: "Failed to update user",
          deleteSuccess: "User deleted successfully",
          deleteError: "Failed to delete user",
        },
      },
      
      permissions: {
        title: "Permissions Management",
        description: "Manage role permissions for granular access control",
        matrix: {
          title: "Permissions Matrix",
          permissionColumn: "Permission",
          noPermissions: "No permissions found",
        },
        validation: {
          nameRequired: "Name is required",
          moduleRequired: "Module is required",
          submoduleRequired: "Submodule is required",
          actionsRequired: "Select at least one action",
        },
        placeholders: {
          selectModule: "Select a module",
          selectModuleFirst: "Select a module first",
          selectSubmodule: "Select a submodule",
        },
        toasts: {
          assignSuccess: "Permission assigned successfully",
          assignError: "Failed to assign permission",
          revokeSuccess: "Permission revoked successfully",
          revokeError: "Failed to revoke permission",
          createSuccess: "Permission created successfully",
          createError: "Error creating permission",
          updateSuccess: "Permission updated successfully",
          updateError: "Error updating permission",
          deleteSuccess: "Permission deleted successfully",
          deleteError: "Error deleting permission",
        },
        crud: {
          createButton: "New Permission",
          createTitle: "New Permission",
          editTitle: "Edit Permission",
          deleteTitle: "Delete Permission",
          deleteConfirm: "Are you sure you want to delete this permission?",
          codeLabel: "Code",
          nameLabel: "Name",
          moduleLabel: "Module",
          submoduleLabel: "Submodule",
          actionsLabel: "Actions",
          descriptionLabel: "Description",
          codePlaceholder: "e.g., kb:images:read",
          namePlaceholder: "e.g., View KB Images",
          modulePlaceholder: "e.g., kb",
          descriptionPlaceholder: "Permission description (optional)",
          usageWarning: "This action will remove all assignments of this permission!",
          usageInfo: "This permission is being used in:",
          rolesUsing: "roles",
          usersUsing: "users",
          creating: "Creating...",
          create: "Create",
          saving: "Saving...",
          save: "Save",
          deleting: "Deleting...",
          delete: "Delete",
          cancel: "Cancel",
        },
        helpers: {
          selectSubmoduleToSeeActions: "Select a submodule to see available actions",
          codesPreview: "Codes that will be generated:",
          permissionInUse: "⚠️ Permission in use:",
        },
      },
      
      // User Management - Extended
      userPermissions: {
        title: "User-Specific Permissions",
        description: "These permissions are added or removed for this specific user, in addition to permissions inherited from the role.",
      },
      
      agents: {
        title: "Specialist Agents",
        subtitle: "Manage specialized agents and sub-agents",
        list: "List",
        createAgent: "Create Agent",
        createSubAgent: "Create Sub-Agent",
        createSubagent: "Create Sub-Agent",
        hierarchy: "Hierarchy",
        activeAgents: "Active Agents",
        agentsInSystem: "agents in system",
        noAgents: "No agents found",
        noAgentsDesc: "Create your first specialist agent",
        loading: "Loading agents...",
        name: "Name",
        description: "Description",
        namespace: "Namespace",
        tier: "Tier",
        agent: "Agent",
        subAgent: "Sub-Agent",
        actions: "Actions",
        edit: "Edit",
        delete: "Delete",
        confirmDelete: "Delete agent?",
        confirmDeleteDesc: "This action cannot be undone.",
        cancel: "Cancel",
        createDialog: {
          title: "Create New Agent",
          subtitle: "Fill in only name and description. System generates slug automatically.",
          namePlaceholder: "Agent name (e.g., Financial Analyst)",
          descriptionPlaceholder: "Description of responsibilities...",
          create: "Create",
          creating: "Creating...",
        },
        editDialog: {
          title: "Edit Agent",
          subtitle: "Update agent information",
          save: "Save",
          saving: "Saving...",
        },
        toast: {
          created: "Agent created successfully!",
          updated: "Agent updated!",
          deleted: "Agent removed!",
        },
      },
      
      datasets: {
        title: "Training Datasets",
        subtitle: "Manage compiled datasets and training data",
      },
      
      curation: {
        title: "Curation Queue",
        subtitle: "Review and approve content before indexing",
        pending: "Pending",
        approved: "Approved",
        rejected: "Rejected",
        history: "History",
        noPending: "No pending items",
        noPendingDesc: "All items have been reviewed",
        review: "Review",
        approve: "Approve",
        reject: "Reject",
        bulkApprove: "Approve Selected",
        bulkReject: "Reject Selected",
        selectedItems: "selected items",
        approveAll: "Approve All",
        rejectAll: "Reject All",
        confirmApprove: "Approve this item?",
        confirmReject: "Reject this item?",
        rejectNote: "Rejection reason",
        rejectNotePlaceholder: "Why was this content rejected?",
        submittedBy: "Submitted by",
        reviewedBy: "Reviewed by",
        note: "Note",
        attachments: "Attachments",
        viewAttachment: "View attachment",
        all: "All",
        pages: "Pages",
        images: "Images",
      },
      
      jobs: {
        title: "Crawling Jobs",
        subtitle: "Monitor asynchronous deep crawling jobs in real-time",
        noJobs: "No jobs found",
        jobId: "Job ID",
        created: "Created",
        started: "Started",
        completed: "Completed",
        progress: "Progress",
        items: "items",
        currentItem: "Current item",
        namespace: "Namespace",
        maxDepth: "Depth",
        maxPages: "Max pages",
        actionSuccess: "Action executed successfully",
        status: {
          pending: "Pending",
          running: "Running",
          paused: "Paused",
          completed: "Completed",
          failed: "Failed",
          cancelled: "Cancelled",
        },
        filters: {
          all: "All",
          active: "Active",
          completed: "Completed",
          failed: "Failed",
        },
      },
      
      imageSearch: {
        title: "Image Search",
        subtitle: "Semantic search using descriptions generated by Vision AI",
        searchPlaceholder: "Describe what you're looking for (e.g., 'blue logo', 'smiling person', 'natural landscape')...",
        search: "Search",
        searching: "Searching...",
        clear: "Clear",
        results: "Search Results",
        allImages: "All Images",
        imagesIndexed: "images indexed",
        imagesFound: "images found for",
        imagesInKb: "images in knowledge base",
        noImages: "No images found",
        noImagesDesc: "Try using different search terms",
        uploadPrompt: "Upload images through the Knowledge Base page",
        remove: "Remove",
        confirmRemove: "Remove this image from KB?",
        removed: "Image removed successfully",
        searchError: "Search error",
        loading: "Loading images...",
      },
      
      vision: {
        title: "Vision System",
        subtitle: "Real-time quota monitoring across 5 providers",
        quotaMonitoring: "Quota Monitoring",
        quotaDesc: "Real-time usage status of vision providers",
        providers: "Configured Providers",
        providersDesc: "Vision AI provider information and status",
        usage: "Usage",
        limit: "Limit",
        available: "Available",
        unavailable: "Unavailable",
        active: "Active",
        missingKey: "Missing Key",
        totalRequests: "Total Requests",
        successRate: "Success Rate",
        tier: "Tier",
        priority: "Priority",
        features: "Features",
        model: "Model",
        dailyLimit: "Daily Limit",
        unlimited: "Unlimited",
        loading: "Loading status...",
        errorLoading: "Error Loading Providers",
        errorLoadingDesc: "Could not load provider information",
        used: "used",
        providersTitle: "Vision AI Providers",
        reqPerDay: "req/day",
        statsTitle: "Usage Statistics (Last 7 Days)",
        statsDesc: "Detailed request history by provider",
        noData: "No data available",
        total: "Total",
        success: "Success",
        failed: "Failed",
        rate: "Rate",
      },
      
      namespaces: {
        title: "Namespaces",
        subtitle: "Manage knowledge base namespace hierarchy",
        createRoot: "Create Root Namespace",
        createSub: "Create Sub-namespace",
        createRootDesc: "Create a new root namespace to organize knowledge by area",
        createSubDesc: "Create a sub-namespace within an existing area",
        noNamespaces: "No namespaces found",
        noNamespacesDesc: "Create your first namespace",
        name: "Name",
        displayName: "Display Name",
        description: "Description",
        type: "Type",
        root: "Root",
        sub: "Sub",
        parent: "Parent",
        actions: "Actions",
        edit: "Edit",
        delete: "Delete",
        confirmDelete: "Delete namespace?",
        cancel: "Cancel",
        create: "Create Namespace",
        creating: "Creating...",
        save: "Save",
        saving: "Saving...",
        rootNameLabel: "Namespace Name *",
        fullNameLabel: "Full Name *",
        namePlaceholder: "e.g., tech.ai.ml",
        rootPlaceholder: "e.g., customer-support, finance",
        displayNamePlaceholder: "e.g., Machine Learning",
        descriptionPlaceholder: "Describe the type of content for this namespace...",
        contentPlaceholder: "Paste text or documents for the Curator Agent to index...",
        rootNameExample: "e.g., projects, sales, documentation",
        subNameExample: "e.g., finance/taxes, tech/apis",
        rootNameHint: "Unique name without '/' for root namespace",
        subNameHint: "Format: parent-namespace/sub-namespace",
        selectParent: "Select parent namespace",
        editCustomVersion: "Create Custom Version",
        editNamespace: "Edit Namespace",
        validation: {
          nameRequired: "Name required",
          nameRequiredDesc: "Please enter a namespace name",
          invalidRootFormat: "Invalid format for root namespace",
          rootNoSlash: "Root namespace cannot contain '/'",
          parentRequired: "Parent namespace required",
          selectParentDesc: "Select the parent namespace to create a sub-namespace",
          invalidFormat: "Invalid format",
          subFormatError: "Sub-namespace must be in parent/child format",
        },
        toast: {
          created: "Namespace created!",
          updated: "Namespace updated!",
          deleted: "Namespace removed!",
          contentQueued: "Content added to curation queue!",
          indexError: "Error indexing content",
          unknownError: "Unknown error",
          customVersionCreated: "Custom version created!",
        },
      },
      
      lifecycle: {
        title: "Lifecycle Policies",
        subtitle: "Data retention and automatic cleanup policies",
        conversations: "Conversations",
        conversationsDesc: "Retention policies for chat conversations",
        training: "Training Data",
        trainingDesc: "Retention policies for training data",
        gpu: "GPU Workers",
        gpuDesc: "Cleanup policies for obsolete GPU workers",
        enabled: "Enabled",
        disabled: "Disabled",
        archive: "Archive",
        purge: "Purge",
        retention: "Retention",
        months: "months",
        years: "years",
        days: "days",
        save: "Save Changes",
        saving: "Saving...",
        saved: "Policies updated",
        unsavedChanges: "You have unsaved changes",
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
    
    meta: {
      dashboard: {
        title: "Meta-Learning",
        subtitle: "Autonomous algorithm learning and self-evolution system",
      },
      tabs: {
        algorithms: "Algorithms",
        experts: "Experts",
        improvements: "Improvements",
      },
      loading: {
        algorithms: "Loading learned algorithms...",
        experts: "Loading adaptive experts...",
        improvements: "Loading code improvements...",
      },
      empty: {
        algorithms: "No algorithms learned yet",
        experts: "No active experts",
        improvements: "No improvements proposed",
      },
      pipeline: {
        execute: "Execute Pipeline",
        executing: "Executing...",
        executed: "Pipeline executed!",
        execution_failed: "Execution failed",
        stages_completed: "stages completed",
      },
      algorithm: {
        default: "Default",
        performance: "Performance",
        set_as_default: "Set as Default",
        default_updated: "Default algorithm updated!",
      },
      expert: {
        accuracy: "Accuracy",
        loss: "Loss",
        samples_processed: "Samples Processed",
        create: "Create Expert",
        creating: "Creating...",
        created: "Expert created!",
        spawned_success: "New expert spawned successfully!",
      },
      improvement: {
        category: "Category",
        severity: "Severity",
        human_review: "Human Review",
        requires: "Requires",
        not_requires: "Not Required",
        validate: "Validate",
        validated: "Validated",
        validation_success: "Improvement validated!",
        apply: "Apply",
        applied: "Applied",
        code_updated: "Code updated successfully!",
      },
      severity: {
        high: "High",
        medium: "Medium",
        low: "Low",
      },
      status: {
        proposed: "Proposed",
        validated: "Validated",
        applied: "Applied",
        error: "Error",
      },
    },
  },
  
  "es-ES": {
    common: {
      error: "Error",
      success: "Éxito",
      loading: "Cargando...",
      loadingError: "Error al cargar datos",
      saveSuccess: "Guardado exitosamente",
      saveError: "Error al guardar",
      deleteSuccess: "Eliminado exitosamente",
      deleteError: "Error al eliminar",
      createSuccess: "Creado exitosamente",
      createError: "Error al crear",
      updateSuccess: "Actualizado exitosamente",
      updateError: "Error al actualizar",
      refresh: "Actualizar",
      active: "Activo",
      inactive: "Inactivo",
      created: "Creado en",
      statusText: "Estado",
      status: {
        ready: "Listo",
        processing: "Procesando",
        failed: "Fallado",
      },
    },
    notFound: {
      title: "404 Página No Encontrada",
      message: "¿Olvidaste agregar la página al enrutador?",
    },
    chat: {
      welcome: "Bienvenido a AION",
      welcomeDesc: "Simple y Sofisticado.",
      placeholder: "Escribe tu mensaje...",
      thinking: "Pensando...",
      send: "Enviar",
      title: "AION",
      subtitle: "",
      newChat: "Nueva Conversación",
      conversations: "Conversaciones",
      languageDetected: "Idioma detectado",
      switchedTo: "Cambiado a",
      tooManyFiles: "Demasiados archivos",
      maxFilesAllowed: "Máximo de 5 archivos permitidos",
      transcriptionFailed: "Transcripción falló",
      transcriptionComplete: "Transcripción completa",
      audioTranscribed: "Audio transcrito con éxito!",
      transcriptionError: "Error en la transcripción",
      transcriptionRetry: "Error al transcribir audio. Inténtalo de nuevo.",
      microphoneAccessDenied: "Acceso al micrófono denegado",
      allowMicrophoneAccess: "Permite acceso al micrófono para grabar audio",
      recordAudio: "Grabar audio",
      stopRecording: "Detener grabación",
      filesAttached: "Archivo(s) adjunto(s)",
      filesReady: "archivo(s) listo(s) para enviar. La IA analizará el contenido.",
      error: "Error",
      failedToInitialize: "Error al inicializar conversación",
      pleaseRefresh: "Por favor, actualiza la página.",
      failedToLoad: "Error al cargar conversación",
      failedToCreate: "Error al crear nueva conversación",
      failedToSend: "Error al enviar mensaje",
      noConversationActive: "No hay conversación activa",
      browserNoAudioSupport: "Tu navegador no soporta grabación de audio",
      attachFilesHint: "Adjuntar archivos (imágenes, videos, documentos)",
      streamingOn: "Streaming ACTIVO (tiempo real)",
      streamingOff: "Streaming DESACTIVADO",
      imageAlt: "Imagen",
    },
    admin: {
      title: "AION Admin",
      subtitle: "Panel de Control y Políticas",
      backToChat: "Volver al Chat",
      
      tabs: {
        overview: "Resumen",
        telemetry: "Telemetría",
        tokenMonitoring: "Monitoreo de Tokens",
        history: "Historial",
        costHistory: "Historial de Costos",
        knowledgeBase: "Base de Conocimiento",
        gpuManagement: "Gestión de GPUs",
        federatedTraining: "Entrenamiento Federado",
        autoEvolution: "Auto-Evolución",
        datasets: "Datasets",
        agents: "Agentes Especialistas",
        curation: "Curaduría",
        settings: "Configuraciones",
      },

      sidebar: {
        navigation: "Navegación",
        categories: {
          commandCenter: "Centro de Comando",
          analytics: "Analíticas y Monitoreo",
          knowledgeVision: "Conocimiento y Visión",
          autonomousAI: "IA Autónoma",
          trainingFabric: "Fábrica de Entrenamiento",
          operations: "Operaciones",
          accessGovernance: "Gobernanza de Acceso",
          systemConfig: "Configuración del Sistema",
        },
      },
      
      overview: {
        totalTokens: "Total de Tokens",
        totalCost: "Costo Total",
        kbSearches: "Búsquedas KB",
        freeApis: "APIs Gratuitas",
        openai: "OpenAI",
        webSearches: "Búsquedas Web",
        kbDocuments: "Documentos KB",
        gpuWorkers: "Trabajadores GPU",
        federatedJobs: "Jobs de Entrenamiento",
        allProviders: "Todos los proveedores",
        openaiOnly: "Solo OpenAI",
        knowledgeBaseQueries: "consultas Base de Conocimiento",
        groqGeminiHfOpenrouter: "Groq, Gemini, HF, OpenRouter",
        paidApiRequests: "Solicitudes API pagadas",
        domainsSearched: "dominios buscados",
        duckduckgoProvider: "DuckDuckGo",
        torNetworkQueries: "consultas red Tor",
        indexedKnowledge: "conocimiento indexado",
        healthyGpuWorkers: "GPUs activas en el pool",
        completedTrainingJobs: "jobs federados completados",
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
        imagesTab: "Gestionar Contenido",
        
        actions: {
          addText: "Añadir Texto",
          learnFromUrl: "Aprender de URL",
          searchWeb: "Buscar Web",
          uploadFiles: "Subir Archivo(s)",
        },
        
        toasts: {
          knowledgeAdded: "¡Conocimiento añadido con éxito!",
          urlContentLearned: "¡Contenido de la URL aprendido con éxito!",
          webSearchSuccess: "¡{{count}} nuevos conocimientos añadidos!",
          searchLabel: "Búsqueda:",
          documentUpdated: "¡Documento actualizado!",
          documentRemoved: "¡Documento eliminado!",
          uploadingFiles: "Subiendo archivos...",
          processingFiles: "Procesando {{count}} archivo(s)...",
          uploadCompleted: "¡Carga completada!",
          filesProcessed: "{{count}} archivo(s) procesado(s) e indexado(s)",
          uploadError: "Error al subir",
          processingFailed: "Error al procesar archivos",
          error: "Error",
        },
        
        forms: {
          addText: {
            title: "Añadir Nuevo Conocimiento",
            titlePlaceholder: "Título del conocimiento...",
            contentPlaceholder: "Escribe el contenido aquí...",
            saving: "Guardando...",
            save: "Guardar",
          },
          learnUrl: {
            title: "Aprender de una URL",
            description: "AION accederá al enlace y aprenderá todo el contenido",
            urlPlaceholder: "https://example.com/articulo",
            learning: "Aprendiendo...",
            learnFromThisUrl: "Aprender de esta URL",
          },
          webSearch: {
            title: "Buscar y Aprender de la Web",
            description: "AION buscará en internet e indexará todo el contenido encontrado",
            searchPlaceholder: "Ej: Machine Learning fundamentals",
            searching: "Buscando...",
            searchAndLearn: "Buscar y Aprender",
          },
        },
        
        documents: {
          title: "Conocimientos Almacenados",
          subtitle: "Gestiona todo el conocimiento de la Base de Conocimiento",
          source: "Fuente",
          save: "Guardar",
          cancel: "Cancelar",
          confirmDelete: "¿Eliminar este conocimiento?",
        },
        
        states: {
          loading: "Cargando...",
          noDocuments: "No se encontró conocimiento. ¡Añade nuevo conocimiento arriba!",
        },
      },
      
      gpuManagement: {
        title: "Gestión de GPUs",
        subtitle: "Gestiona workers de GPU y balanceo de carga",
        activeWorkers: "Workers Activos",
        totalGPUs: "Total de GPUs",
        totalRequests: "Total de Solicitudes",
        avgLatency: "Latencia Media",
        avgLatencyMs: "Latencia Media",
        errorRate: "Tasa de Errores",
        workersOnline: "workers en línea",
        requestsProcessed: "solicitudes procesadas",
        avgResponseTime: "tiempo medio de respuesta",
        failedRequests: "solicitudes fallidas",
        registeredWorkers: "Workers Registrados",
        manageAllGpuWorkers: "Gestiona todos los workers de GPU",
        provider: "Proveedor",
        account: "Cuenta",
        model: "Modelo",
        gpu: "GPU",
        status: "Estado",
        health: "Salud",
        tempo: "Tiempo",
        requests: "Solicitudes",
        latency: "Latencia",
        lastUsed: "Último Uso",
        actions: "Acciones",
        healthy: "Saludable",
        unhealthy: "No Saludable",
        online: "En Línea",
        offline: "Fuera de Línea",
        pending: "Pendiente",
        addWorker: "Agregar GPU Worker",
        refresh: "Actualizar",
        edit: "Editar",
        delete: "Eliminar",
        remove: "Eliminar",
        loading: "Cargando workers de GPU...",
        noWorkers: "No hay Workers de GPU Registrados",
        noWorkersDesc: "Los workers de GPU aparecerán aquí una vez que se registren a través del script Colab/Kaggle.",
        confirmDelete: "¿Estás seguro de que deseas eliminar este worker?",
        toast: {
          workerRemoved: "GPU Worker Eliminado",
          workerRemovedDesc: "El GPU worker ha sido eliminado exitosamente del pool.",
          error: "Error",
          errorRemovingWorker: "No se pudo eliminar el GPU worker",
        },
        time: {
          never: "Nunca",
          na: "N/A",
          shuttingDown: "Apagando...",
          secondsAgo: "s atrás",
          minutesAgo: "m atrás",
          hoursAgo: "h atrás",
          hourUnit: "h",
          minuteUnit: "m",
          secondUnit: "s",
        },
      },
      
      addGpuWorker: {
        title: "Agregar GPU Worker",
        description: "Aprovisiona automáticamente notebooks de Kaggle o Colab como GPU workers",
        kaggleTab: "Kaggle (API)",
        colabTab: "Google Colab",
        kaggle: {
          title: "Kaggle Notebook (100% Automático)",
          subtitle: "30h/semana gratis, P100 GPU, API oficial, cero manual",
          username: "Kaggle Username *",
          usernamePlaceholder: "tu-username",
          apiKey: "Kaggle API Key *",
          apiKeyPlaceholder: "Tu API Key (del kaggle.json)",
          apiKeyHelp: "Consíguelo en: kaggle.com/settings → API → Create New Token",
          notebookName: "Nombre del Notebook (opcional)",
          notebookNamePlaceholder: "aion-gpu-worker",
          howItWorks: "Cómo funciona:",
          step1: "La API crea el notebook automáticamente",
          step2: "El notebook ejecuta el script AION GPU worker",
          step3: "El worker se registra vía ngrok (~2min)",
          step4: 'La GPU aparece aquí con estado "Healthy"',
          cancel: "Cancelar",
          provision: "Aprovisionar Kaggle",
          provisioning: "Aprovisionando...",
          requiredFields: "Campos obligatorios",
          requiredFieldsDesc: "Username y API Key son obligatorios",
          success: "Kaggle Worker Provisioning",
          successDesc: "¡Notebook creado con éxito! La GPU se registrará en ~2-3 minutos.",
          error: "Error al aprovisionar Kaggle",
          errorDesc: "No se pudo crear el notebook de Kaggle",
        },
        colab: {
          title: "Google Colab (Puppeteer)",
          subtitle: "GPU T4 gratuita, orquestación vía Puppeteer (sin API pública)",
          email: "Email de Google *",
          emailPlaceholder: "tu-email@gmail.com",
          password: "Contraseña de Google *",
          passwordPlaceholder: "Tu contraseña",
          passwordHelp: "⚠️ Credenciales almacenadas con cifrado AES-256",
          notebookUrl: "Notebook URL (opcional)",
          notebookUrlPlaceholder: "https://colab.research.google.com/drive/...",
          notebookUrlHelp: "Déjalo vacío para crear un nuevo notebook automáticamente",
          howItWorks: "⚡ Cómo funciona (Puppeteer):",
          step1: "Puppeteer inicia sesión en Google (headless)",
          step2: "Crea/abre notebook en Colab",
          step3: "Ejecuta el script AION GPU worker",
          step4: "El worker se registra vía ngrok (~3-5min)",
          estimatedTime: "⏱️ Tiempo estimado: 3-5 minutos (login + aprovisionamiento)",
          cancel: "Cancelar",
          provision: "Aprovisionar Colab",
          provisioning: "Aprovisionando...",
          requiredFields: "Campos obligatorios",
          requiredFieldsDesc: "Email y contraseña de Google son obligatorios",
          success: "Colab Worker Provisioning",
          successDesc: "¡Notebook aprovisionado con éxito! La GPU se registrará en ~3-5 minutos.",
          error: "Error al aprovisionar Colab",
          errorDesc: "No se pudo orquestar el notebook de Colab",
        },
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
        
        datasetSelector: {
          label: "Dataset para Entrenamiento",
          placeholder: "Seleccionar dataset...",
          autoGenerated: "📚 Auto-Generated from KB (Recomendado)",
          highQuality: "⭐ KB High-Quality Only (score ≥ 80)",
          autoDesc: "Datasets auto-generados usan conversaciones de alta calidad de tu Knowledge Base para aprendizaje continuo",
        },
        
        jobDetails: {
          progress: "Progreso",
          steps: "pasos",
          globalLoss: "Global Loss",
          bestLoss: "Best Loss",
          completedChunks: "Chunks Completados",
          workers: "workers",
          viewDetails: "Ver Detalles",
          pause: "Pausar",
          resume: "Reanudar",
          na: "N/A",
        },
        
        datasetManagement: {
          title: "Training Datasets",
          subtitle: "Carga y gestión de datasets para entrenamiento federado",
          uploadButton: "Cargar Dataset",
          noDatasets: "No hay datasets cargados aún",
          noDatasetsDesc: "Carga un dataset para comenzar el entrenamiento",
          type: "Tipo",
          examples: "Ejemplos",
          size: "Tamaño",
          mbUnit: "MB",
          delete: "Eliminar",
        },
        
        toast: {
          datasetRequired: "⚠️ Dataset Requerido",
          datasetRequiredDesc: "Por favor, selecciona un dataset para entrenamiento",
          generatingDataset: "🔄 Generando Dataset desde KB...",
          generatingDatasetDesc: "Recopilando conversaciones de alta calidad para entrenamiento",
          datasetGenerated: "✅ ¡Dataset Generado!",
          datasetGeneratedDesc: "ejemplos de entrenamiento creados (score promedio:",
          datasetGenerationFailed: "❌ Generación de Dataset Fallida",
          nameRequired: "⚠️ Nombre Requerido",
          nameRequiredDesc: "Por favor, ingresa un nombre para el dataset",
          fileRequired: "⚠️ Archivo Requerido",
          fileRequiredDesc: "Por favor, selecciona un archivo para cargar",
          datasetUploaded: "✅ Dataset Cargado",
          datasetUploadedDesc: "Dataset procesado exitosamente",
          uploadFailed: "❌ Carga Fallida",
          datasetDeleted: "✅ Dataset Eliminado",
          deleteFailed: "❌ Eliminación Fallida",
        },
      },
      
      behavior: {
        title: "Comportamiento de la IA",
        description: "Ajusta la personalidad y estilo de respuesta con 7 características configurables",
        verbosity: "Verbosidad",
        verbosityDesc: "0% = Respuestas cortas (1-2 frases) | 100% = Respuestas detalladas y completas",
        formality: "Formalidad",
        formalityDesc: "0% = Casual y amigable | 100% = Formal y profesional",
        creativity: "Creatividad",
        creativityDesc: "0% = Solo hechos objetivos | 100% = Usa metáforas, analogías y lenguaje creativo",
        precision: "Precisión",
        precisionDesc: "0% = Números aproximados y estimaciones | 100% = Números exactos y fuentes citadas",
        persuasiveness: "Persuasión",
        persuasivenessDesc: "0% = Presenta hechos neutrales | 100% = Usa técnicas persuasivas y argumentos fuertes",
        empathy: "Empatía",
        empathyDesc: "0% = Objetivo y factual | 100% = Muestra empatía y consideración emocional",
        enthusiasm: "Entusiasmo",
        enthusiasmDesc: "0% = Tono calmado y reservado | 100% = Alta energía y lenguaje expresivo!",
        systemPrompt: "System Prompt",
        systemPromptDesc: "Instrucciones base para el comportamiento de la IA",
        systemPromptPlaceholder: "Introduce el system prompt...",
        viewFullPrompt: "Ver Prompt Completo",
        previewModal: {
          title: "Prompt Completo (Enviado a las IAs)",
          description: "Este es el prompt REAL que AION envía a OpenAI, Groq, Gemini y otras APIs. Incluye tus configuraciones personalizadas + las 7 características del ecualizador.",
          loading: "Cargando...",
          close: "Cerrar",
          characters: "caracteres",
        },
      },
      
      settings: {
        title: "Configuraciones",
        subtitle: "Configura políticas, comportamiento y preferencias del sistema",
        timezone: {
          title: "Zona Horaria",
          description: "Selecciona tu zona horaria para visualización correcta de fechas y horas",
          select: "Seleccionar Zona Horaria",
          currentTime: "Hora actual",
          save: "Guardar",
          saving: "Guardando...",
          saved: "¡Zona horaria guardada con éxito!",
          saveError: "Error al guardar zona horaria",
        },
      },
      
      userManagement: {
        title: "Gestión de Usuarios",
        subtitle: "Gestiona usuarios del sistema y sus roles",
        addUser: "Añadir Usuario",
        alertInfo: "Los usuarios con tipo \"dashboard\" pueden acceder al panel administrativo. Los usuarios con tipo \"chat\" solo pueden usar la interfaz de chat.",
        usersCount: "Usuarios",
        loading: "Cargando usuarios...",
        noUsers: "No se encontraron usuarios.",
        noUsersDesc: "Crea tu primer usuario para comenzar.",
        deleteConfirm: "¿Estás seguro de que deseas eliminar este usuario?",
        table: {
          name: "Nombre",
          email: "Correo electrónico",
          type: "Tipo",
          roles: "Roles",
          created: "Creado",
          actions: "Acciones",
          noRoles: "Sin roles",
        },
        dialog: {
          createTitle: "Crear Nuevo Usuario",
          editTitle: "Editar Usuario",
          name: "Nombre",
          namePlaceholder: "Juan Pérez",
          email: "Correo electrónico",
          emailPlaceholder: "juan@ejemplo.com",
          password: "Contraseña",
          passwordPlaceholder: "••••••••",
          passwordEditNote: "Contraseña (dejar en blanco para mantener actual)",
          userType: "Tipo de Acceso",
          userTypeAccessLabel: "Permisos de Acceso",
          userTypeAccessDescription: "Seleccione a qué interfaces puede acceder el usuario",
          userTypeDashboard: "Acceso al Panel Administrativo",
          userTypeChat: "Acceso al Chat",
          userTypeBoth: "Ambos",
          userTypeNone: "Ninguno",
          userTypeRequired: "Seleccione al menos un permiso de acceso",
          cancel: "Cancelar",
          create: "Crear Usuario",
          creating: "Creando...",
          update: "Actualizar Usuario",
          updating: "Actualizando...",
        },
        toasts: {
          createSuccess: "Usuario creado con éxito",
          createError: "Error al crear usuario",
          updateSuccess: "Usuario actualizado con éxito",
          updateError: "Error al actualizar usuario",
          deleteSuccess: "Usuario eliminado con éxito",
          deleteError: "Error al eliminar usuario",
        },
      },
      
      permissions: {
        title: "Gestión de Permisos",
        description: "Gestiona permisos de roles para control de acceso granular",
        matrix: {
          title: "Matriz de Permisos",
          permissionColumn: "Permiso",
          noPermissions: "No se encontraron permisos",
        },
        validation: {
          nameRequired: "Nombre es obligatorio",
          moduleRequired: "Módulo es obligatorio",
          submoduleRequired: "Submódulo es obligatorio",
          actionsRequired: "Seleccione al menos una acción",
        },
        placeholders: {
          selectModule: "Seleccione un módulo",
          selectModuleFirst: "Seleccione un módulo primero",
          selectSubmodule: "Seleccione un submódulo",
        },
        toasts: {
          assignSuccess: "Permiso asignado con éxito",
          assignError: "Error al asignar permiso",
          revokeSuccess: "Permiso revocado con éxito",
          revokeError: "Error al revocar permiso",
          createSuccess: "Permiso creado con éxito",
          createError: "Error al crear permiso",
          updateSuccess: "Permiso actualizado con éxito",
          updateError: "Error al actualizar permiso",
          deleteSuccess: "Permiso eliminado con éxito",
          deleteError: "Error al eliminar permiso",
        },
        crud: {
          createButton: "Nuevo Permiso",
          createTitle: "Nuevo Permiso",
          editTitle: "Editar Permiso",
          deleteTitle: "Eliminar Permiso",
          deleteConfirm: "¿Está seguro de que desea eliminar este permiso?",
          codeLabel: "Código",
          nameLabel: "Nombre",
          moduleLabel: "Módulo",
          submoduleLabel: "Submódulo",
          actionsLabel: "Acciones",
          descriptionLabel: "Descripción",
          codePlaceholder: "ej: kb:images:read",
          namePlaceholder: "ej: Ver Imágenes KB",
          modulePlaceholder: "ej: kb",
          descriptionPlaceholder: "Descripción del permiso (opcional)",
          usageWarning: "¡Esta acción eliminará todas las asignaciones de este permiso!",
          usageInfo: "Este permiso está siendo usado en:",
          rolesUsing: "roles",
          usersUsing: "usuarios",
          creating: "Creando...",
          create: "Crear",
          saving: "Guardando...",
          save: "Guardar",
          deleting: "Eliminando...",
          delete: "Eliminar",
          cancel: "Cancelar",
        },
        helpers: {
          selectSubmoduleToSeeActions: "Seleccione un submódulo para ver las acciones disponibles",
          codesPreview: "Códigos que se generarán:",
          permissionInUse: "⚠️ Permiso en uso:",
        },
      },
      
      // User Management - Extended
      userPermissions: {
        title: "Permisos Específicos del Usuario",
        description: "Estos permisos se agregan o eliminan para este usuario específico, además de los permisos heredados del rol.",
      },
      
      agents: {
        title: "Agentes Especialistas",
        subtitle: "Gestiona agentes y sub-agentes especializados",
        list: "Lista",
        createAgent: "Crear Agente",
        createSubAgent: "Crear Sub-Agente",
        createSubagent: "Crear Sub-Agente",
        hierarchy: "Jerarquía",
        activeAgents: "Agentes Activos",
        agentsInSystem: "agentes en el sistema",
        noAgents: "No hay agentes registrados",
        noAgentsDesc: "Crea tu primer agente especialista",
        loading: "Cargando agentes...",
        name: "Nombre",
        description: "Descripción",
        namespace: "Namespace",
        tier: "Tipo",
        agent: "Agente",
        subAgent: "Sub-Agente",
        actions: "Acciones",
        edit: "Editar",
        delete: "Eliminar",
        confirmDelete: "¿Eliminar agente?",
        confirmDeleteDesc: "Esta acción no se puede deshacer.",
        cancel: "Cancelar",
        createDialog: {
          title: "Crear Nuevo Agente",
          subtitle: "Completa solo nombre y descripción. El sistema genera el slug automáticamente.",
          namePlaceholder: "Nombre del agente (ej: Analista Financiero)",
          descriptionPlaceholder: "Descripción de responsabilidades...",
          create: "Crear",
          creating: "Creando...",
        },
        editDialog: {
          title: "Editar Agente",
          subtitle: "Actualiza la información del agente",
          save: "Guardar",
          saving: "Guardando...",
        },
        toast: {
          created: "¡Agente creado con éxito!",
          updated: "¡Agente actualizado!",
          deleted: "¡Agente eliminado!",
        },
      },
      
      datasets: {
        title: "Datasets de Entrenamiento",
        subtitle: "Gestiona datasets compilados y datos de entrenamiento",
      },
      
      curation: {
        title: "Cola de Curaduría",
        subtitle: "Revisa y aprueba contenido antes de indexar",
        pending: "Pendiente",
        approved: "Aprobado",
        rejected: "Rechazado",
        history: "Historial",
        noPending: "No hay items pendientes",
        noPendingDesc: "Todos los items han sido revisados",
        review: "Revisar",
        approve: "Aprobar",
        reject: "Rechazar",
        bulkApprove: "Aprobar Seleccionados",
        bulkReject: "Rechazar Seleccionados",
        selectedItems: "items seleccionados",
        approveAll: "Aprobar Todos",
        rejectAll: "Rechazar Todos",
        confirmApprove: "¿Aprobar este item?",
        confirmReject: "¿Rechazar este item?",
        rejectNote: "Motivo del rechazo",
        rejectNotePlaceholder: "¿Por qué se rechazó este contenido?",
        submittedBy: "Enviado por",
        reviewedBy: "Revisado por",
        note: "Nota",
        attachments: "Adjuntos",
        viewAttachment: "Ver adjunto",
        all: "Todos",
        pages: "Páginas",
        images: "Imágenes",
      },
      
      jobs: {
        title: "Trabajos de Crawling",
        subtitle: "Monitorea trabajos asíncronos de deep crawling en tiempo real",
        noJobs: "No se encontraron trabajos",
        jobId: "ID de Trabajo",
        created: "Creado",
        started: "Iniciado",
        completed: "Completado",
        progress: "Progreso",
        items: "elementos",
        currentItem: "Elemento actual",
        namespace: "Namespace",
        maxDepth: "Profundidad",
        maxPages: "Máx. páginas",
        actionSuccess: "Acción ejecutada con éxito",
        status: {
          pending: "Pendiente",
          running: "Ejecutando",
          paused: "Pausado",
          completed: "Completado",
          failed: "Falló",
          cancelled: "Cancelado",
        },
        filters: {
          all: "Todos",
          active: "Activos",
          completed: "Completados",
          failed: "Fallidos",
        },
      },
      
      imageSearch: {
        title: "Búsqueda de Imágenes",
        subtitle: "Búsqueda semántica usando descripciones generadas por Vision AI",
        searchPlaceholder: "Describe lo que buscas (ej: 'logo azul', 'persona sonriendo', 'paisaje natural')...",
        search: "Buscar",
        searching: "Buscando...",
        clear: "Limpiar",
        results: "Resultados de Búsqueda",
        allImages: "Todas las Imágenes",
        imagesIndexed: "imágenes indexadas",
        imagesFound: "imágenes encontradas para",
        imagesInKb: "imágenes en la base de conocimiento",
        noImages: "No se encontraron imágenes",
        noImagesDesc: "Intenta usar términos de búsqueda diferentes",
        uploadPrompt: "Sube imágenes a través de la página de Knowledge Base",
        remove: "Eliminar",
        confirmRemove: "¿Eliminar esta imagen de KB?",
        removed: "Imagen eliminada con éxito",
        searchError: "Error en la búsqueda",
        loading: "Cargando imágenes...",
      },
      
      vision: {
        title: "Vision System",
        subtitle: "Monitoreo de cuota en tiempo real a través de 5 proveedores",
        quotaMonitoring: "Monitoreo de Cuota",
        quotaDesc: "Estado de uso en tiempo real de proveedores de visión",
        providers: "Proveedores Configurados",
        providersDesc: "Información y estado de proveedores de Vision AI",
        usage: "Uso",
        limit: "Límite",
        available: "Disponible",
        unavailable: "No disponible",
        active: "Activo",
        missingKey: "Clave Faltante",
        totalRequests: "Total de Solicitudes",
        successRate: "Tasa de Éxito",
        tier: "Tier",
        priority: "Prioridad",
        features: "Características",
        model: "Modelo",
        dailyLimit: "Límite Diario",
        unlimited: "Ilimitado",
        loading: "Cargando estado...",
        errorLoading: "Error al Cargar Proveedores",
        errorLoadingDesc: "No se pudo cargar información de proveedores",
        used: "usado",
        providersTitle: "Proveedores de Vision AI",
        reqPerDay: "req/día",
        statsTitle: "Estadísticas de Uso (Últimos 7 Días)",
        statsDesc: "Historial detallado de solicitudes por proveedor",
        noData: "No hay datos disponibles",
        total: "Total",
        success: "Éxito",
        failed: "Fallido",
        rate: "Tasa",
      },
      
      namespaces: {
        title: "Namespaces",
        subtitle: "Gestiona la jerarquía de namespaces de la base de conocimiento",
        createRoot: "Crear Namespace Raíz",
        createSub: "Crear Sub-namespace",
        createRootDesc: "Crea un nuevo namespace raíz para organizar conocimiento por área",
        createSubDesc: "Crea un sub-namespace dentro de un área existente",
        noNamespaces: "No se encontraron namespaces",
        noNamespacesDesc: "Crea tu primer namespace",
        name: "Nombre",
        displayName: "Nombre de Visualización",
        description: "Descripción",
        type: "Tipo",
        root: "Raíz",
        sub: "Sub",
        parent: "Padre",
        actions: "Acciones",
        edit: "Editar",
        delete: "Eliminar",
        confirmDelete: "¿Eliminar namespace?",
        cancel: "Cancelar",
        create: "Crear Namespace",
        creating: "Creando...",
        save: "Guardar",
        saving: "Guardando...",
        rootNameLabel: "Nombre del Namespace *",
        fullNameLabel: "Nombre Completo *",
        namePlaceholder: "ej: tech.ai.ml",
        rootPlaceholder: "Ej: atencion-cliente, finanzas",
        displayNamePlaceholder: "ej: Machine Learning",
        descriptionPlaceholder: "Describe el tipo de contenido de este namespace...",
        contentPlaceholder: "Pega textos o documentos para que el Agente Curador los indexe...",
        rootNameExample: "Ej: proyectos, ventas, documentacion",
        subNameExample: "Ej: finanzas/impuestos, tech/apis",
        rootNameHint: "Nombre único sin '/' para namespace raíz",
        subNameHint: "Formato: namespace-padre/sub-namespace",
        selectParent: "Seleccionar namespace padre",
        editCustomVersion: "Crear Versión Personalizada",
        editNamespace: "Editar Namespace",
        validation: {
          nameRequired: "Nombre obligatorio",
          nameRequiredDesc: "Por favor, ingresa un nombre para el namespace",
          invalidRootFormat: "Formato inválido para namespace raíz",
          rootNoSlash: "El namespace raíz no puede contener '/'",
          parentRequired: "Namespace padre obligatorio",
          selectParentDesc: "Selecciona el namespace padre para crear un sub-namespace",
          invalidFormat: "Formato inválido",
          subFormatError: "Sub-namespace debe estar en formato padre/hijo",
        },
        toast: {
          created: "¡Namespace creado!",
          updated: "¡Namespace actualizado!",
          deleted: "¡Namespace eliminado!",
          contentQueued: "¡Contenido agregado a la cola de curación!",
          indexError: "Error al indexar contenido",
          unknownError: "Error desconocido",
          customVersionCreated: "¡Versión personalizada creada!",
        },
      },
      
      lifecycle: {
        title: "Lifecycle Policies",
        subtitle: "Políticas de retención y limpieza automática de datos",
        conversations: "Conversaciones",
        conversationsDesc: "Políticas de retención para conversaciones de chat",
        training: "Training Data",
        trainingDesc: "Políticas de retención para datos de entrenamiento",
        gpu: "GPU Workers",
        gpuDesc: "Políticas de limpieza para workers GPU obsoletos",
        enabled: "Habilitado",
        disabled: "Deshabilitado",
        archive: "Archivo",
        purge: "Purga",
        retention: "Retención",
        months: "meses",
        years: "años",
        days: "días",
        save: "Guardar Cambios",
        saving: "Guardando...",
        saved: "Políticas actualizadas",
        unsavedChanges: "Tienes cambios sin guardar",
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
    
    meta: {
      dashboard: {
        title: "Meta-Learning",
        subtitle: "Sistema autónomo de aprendizaje de algoritmos y auto-evolución",
      },
      tabs: {
        algorithms: "Algoritmos",
        experts: "Expertos",
        improvements: "Mejoras",
      },
      loading: {
        algorithms: "Cargando algoritmos aprendidos...",
        experts: "Cargando expertos adaptativos...",
        improvements: "Cargando mejoras de código...",
      },
      empty: {
        algorithms: "Ningún algoritmo aprendido todavía",
        experts: "Ningún experto activo",
        improvements: "Ninguna mejora propuesta",
      },
      pipeline: {
        execute: "Ejecutar Pipeline",
        executing: "Ejecutando...",
        executed: "¡Pipeline ejecutado!",
        execution_failed: "Ejecución fallida",
        stages_completed: "etapas completadas",
      },
      algorithm: {
        default: "Predeterminado",
        performance: "Rendimiento",
        set_as_default: "Establecer como Predeterminado",
        default_updated: "¡Algoritmo predeterminado actualizado!",
      },
      expert: {
        accuracy: "Precisión",
        loss: "Pérdida",
        samples_processed: "Muestras Procesadas",
        create: "Crear Experto",
        creating: "Creando...",
        created: "¡Experto creado!",
        spawned_success: "¡Nuevo experto spawned exitosamente!",
      },
      improvement: {
        category: "Categoría",
        severity: "Severidad",
        human_review: "Revisión Humana",
        requires: "Requiere",
        not_requires: "No Requiere",
        validate: "Validar",
        validated: "Validado",
        validation_success: "¡Mejora validada!",
        apply: "Aplicar",
        applied: "Aplicado",
        code_updated: "¡Código actualizado exitosamente!",
      },
      severity: {
        high: "Alta",
        medium: "Media",
        low: "Baja",
      },
      status: {
        proposed: "Propuesto",
        validated: "Validado",
        applied: "Aplicado",
        error: "Error",
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
