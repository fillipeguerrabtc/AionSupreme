import { createContext, useContext, useState, ReactNode } from "react";

export type Language = "pt-BR" | "en-US" | "es-ES";

interface Translations {
  // Common UI strings
  common: {
    error: string;
    success: string;
    loading: string;
    loadingError: string;
    save: string;
    saving: string;
    cancel: string;
    delete: string;
    deleting: string;
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
    addedSuccess: string;
    removedSuccess: string;
    approvedSuccess: string;
    rejectedSuccess: string;
    approveError: string;
    rejectError: string;
    selectAtLeastOne: string;
    search: string;
    processingFiles: string;
    files: string;
    processedAndIndexed: string;
    failedToProcess: string;
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
      today24h: string;
      history: string;
      todayUsageUtc: string;
      totalHistory: string;
      tokens: string;
      autoEvolution: string;
      conversations: string;
      highQuality: string;
      datasetsKb: string;
      jobs: string;
      autoLearningSystem: string;
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
        urlWarningWithUrl: string; // Warning: protocol added - {{url}}
        webSearchSuccess: string;
        webSearchWithCountAndQuery: string; // {{count}} items from search "{{query}}"
        documentUpdated: string;
        documentRemoved: string;
        uploadingFiles: string;
        processingFiles: string;
        uploadCompleted: string;
        filesProcessed: string;
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
          namespaces: {
            label: string;
            help: string;
          };
        };
        learnUrl: {
          title: string;
          description: string;
          urlPlaceholder: string;
          learning: string;
          learnFromThisUrl: string;
          learningMode: string;
          singlePage: string;
          deepCrawl: string;
          downloadMedia: string;
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
        editTitlePlaceholder: string;
        editContentPlaceholder: string;
        sourceTypes: {
          manual: string;
          url: string;
          websearch: string;
          file: string;
        };
      };
      
      // TODO: Consider mirroring under admin.cascade when used across multiple pages
      cascade: {
        dialog: {
          title: string;
          aboutToDelete: string; // "You are about to delete: {{title}}"
          analyzingImpact: string;
          loadError: string; // "Failed to load dependency graph: {{error}}"
          cascadeImpactLabel: string;
          willAffectTemplate: string; // "This deletion will affect {{datasets}} datasets and {{models}} models"
          modelsTaintedSuffix: string; // "({{count}} models already tainted)"
          noImpact: string;
          affectedDatasetsTitle: string; // "Affected Datasets ({{count}})"
          affectedModelsTitle: string; // "Affected Models ({{count}})"
          datasetVersion: string; // "Dataset #{{id}} v{{version}}"
          taintedBadge: string;
          deletionReasonLabel: string;
          deletionReasonRequired: string;
          selectReasonPlaceholder: string;
          reasonQuality: string;
          reasonDuplicate: string;
          reasonExpired: string;
          reasonRequest: string;
          reasonGdpr: string;
          gdprReasonLabel: string;
          gdprReasonRequired: string;
          gdprReasonPlaceholder: string;
          retentionDaysLabel: string;
          retentionPlaceholder: string;
          retentionHint: string;
          deleteButtonLabel: string; // Reuse common.delete for "Delete Document"
        };
        status: {
          active: string;
          tainted: string;
          deleted: string;
          pending: string;
        };
        toasts: {
          validationErrorTitle: string;
          selectReasonError: string;
          gdprReasonRequiredTitle: string;
          gdprReasonRequiredDesc: string;
          deleteSuccessTitle: string;
          deleteSuccessDescTemplate: string; // "Deletion complete: {{datasets}} datasets and {{models}} models affected"
        };
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
      
      // Header
      header: {
        title: string;
        subtitle: string;
        addGpu: string;
      };
      
      // Stats Cards
      stats: {
        totalWorkers: string;
        autoManualTemplate: string; // "{auto} auto / {manual} manual"
        online: string;
        offlineUnhealthyTemplate: string; // "{offline} offline · {unhealthy} unhealthy"
        totalRequests: string;
        avgLatency: string;
        msUnit: string;
      };
      
      // Table
      table: {
        title: string;
        headers: {
          id: string;
          type: string;
          provider: string;
          account: string;
          gpu: string;
          status: string;
          quota: string;
          requests: string;
          latency: string;
          actions: string;
        };
        na: string;
      };
      
      // Badges
      badges: {
        online: string;
        offline: string;
        unhealthy: string;
        pending: string;
        auto: string;
        manual: string;
      };
      
      // Quota
      quota: {
        sessionTemplate: string; // "Session: {used}h / {max}h"
        weekTemplate: string; // "Week: {used}h / 30h"
        hourUnit: string;
      };
      
      // Empty State
      emptyState: {
        message: string;
        addFirstGpu: string;
      };
      
      // Dialogs
      dialogs: {
        addWorkerTitle: string;
        chooseMethod: string;
        comingSoon: string;
        kaggleDesc: string;
        colabDesc: string;
        manualDesc: string;
        kaggleButton: string;
        colabButton: string;
        manualButton: string;
      };
      
      // NEW: Tabs Navigation
      tabs: {
        overview: string;
        auth: string;
        quotas: string;
        timeline: string;
        workersCount: string; // "Workers ({count})"
      };
      
      // NEW: Auto-Refresh Configuration
      autoRefresh: {
        title: string;
        description: string;
        interval: string;
        intervalOptions: {
          tenSeconds: string;
          thirtySeconds: string;
          oneMinute: string;
          fiveMinutes: string;
        };
        status: {
          stale: string;
          updated: string;
        };
      };
      
      // NEW: Authentication Section
      auth: {
        title: string;
        description: string;
        statusTitle: string;
        accountsConnectedCount: string; // "{count} conta(s) conectada(s)"
        addAccount: string;
        connectAccount: string;
        connectedAccountsTitle: string;
        providers: string;
        valid: string;
        expired: string;
        // Auth status badges
        authenticated: string;
        notAuthenticated: string;
        expiringSoon: string;
      };
      
      // NEW: Quotas Section
      quotas: {
        title: string;
        syncButton: string;
        syncing: string;
        emptyMessage: string;
        emptyAction: string;
      };
      
      // NEW: Usage History Section
      usageHistory: {
        title: string;
        description: string;
        noData: string;
        timeRanges: {
          oneHour: string;
          sixHours: string;
          twentyFourHours: string;
          sevenDays: string;
          thirtyDays: string;
        };
        thresholds: {
          warning: string;
          critical: string;
          emergency: string;
        };
        // Provider names for legend
        providers: {
          kaggle: string;
          colab: string;
        };
        // Accessibility labels
        aria: {
          timeRangeSelector: string;
        };
      };
      
      // NEW: Timeline Section
      timeline: {
        title: string;
        description: string;
        emptyMessage: string;
        noSessions: string;
        remaining: string;
        cooldown: string;
        readyToStart: string;
        canStart: string;
        cannotStart: string;
        shouldStop: string;
        okToContinue: string;
        // Status labels for session states
        status: {
          idle: string;
          active: string;
          cooldown: string;
          available: string;
        };
        // Misc labels
        labels: {
          placeholder: string; // "-" placeholder for empty fields
        };
      };
      
      // NEW: Quota Alerts
      quotaAlerts: {
        dismiss: string; // "Dismiss alert"
        titleTemplate: string; // "{provider} Quota Alert - {percentage}% Used"
        syncButton: string; // "Sync Now"
        emergencyAction: string; // "⚠️ Immediate action required..."
        criticalWarning: string; // "⚠️ High usage detected..."
      };
      
      // NEW: Time Templates
      timeTemplates: {
        week: string; // "Semana: {used}h / {max}h"
        session: string; // "Sessão: {used}h / {max}h"
      };
      
      // NEW: Overview Cards (QuotaOverviewCard + GPUWorkersCard)
      overviewCards: {
        quotaCard: {
          title: string;
          subtitle: string;
          emptyState: {
            noAccount: string;
            connectHint: string;
            connectButton: string;
          };
          alertLevels: {
            normal: string;
            warning: string;
            critical: string;
            emergency: string;
          };
          stale: string;
          descriptionFull: string;
          kaggle: {
            errorTitle: string;
            errorFallback: string;
            noDataTitle: string;
            noDataDesc: string;
            label: string;
            modeBadge: string; // "On-Demand + Idle (10min)"
            weeklyTemplate: string; // "Semanal: {used}h / {max}h"
            percentUsed: string; // "% usado"
            canStart: string;
            quotaExhausted: string;
          };
          colab: {
            errorTitle: string;
            errorFallback: string;
            noDataTitle: string;
            noDataDesc: string;
            label: string;
            modeBadge: string; // "Schedule Fixo (36h cooldown)"
            unitsTemplate: string; // "Unidades: {used} / {max}"
            percentUsed: string;
            canStart: string;
            inCooldown: string;
          };
          actions: {
            viewDetails: string;
            sync: string;
            syncing: string;
          };
        };
        workersCard: {
          title: string;
          loading: string;
          manage: string;
          emptyState: {
            noWorkers: string;
            addHint: string;
            addButton: string;
          };
          healthLevels: {
            excellent: string;
            good: string;
            degraded: string;
            critical: string;
          };
          poolDescriptionSingular: string; // "Pool de {count} worker GPU"
          poolDescriptionPlural: string; // "Pool de {count} workers GPU"
          statusLabels: {
            healthy: string;
            unhealthy: string;
            offline: string;
          };
          metrics: {
            totalRequests: string;
            avgLatency: string;
          };
          actions: {
            viewAll: string; // "Ver Todos ({count})"
            add: string;
          };
        };
      };
      
      // Legacy fields (mantidos para compatibilidade)
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
      
      // Google Auth Dialog (66 i18n keys - PT/EN/ES complete)
      googleAuthDialog: {
        dialog: {
          trigger: string;
          title: string;
          description: string;
        };
        tabs: {
          instructions: string;
          kaggle: string;
          colab: string;
        };
        instructions: {
          howItWorks: {
            title: string;
            description: string;
          };
          prerequisites: {
            title: string;
            chrome: string;
            account: string;
            devtools: string;
          };
          security: {
            title: string;
            encryption: string;
            noPlaintext: string;
            autoValidation: string;
            expiration: string;
          };
          warning: {
            title: string;
            kaggle: string;
            colab: string;
            auto: string;
          };
          buttons: {
            kaggle: string;
            colab: string;
          };
        };
        kaggle: {
          title: string;
          step1: string;
          step2: string;
          step3: string;
          step4: string;
          cookieCommand: {
            label: string;
          };
          email: {
            label: string;
            placeholder: string;
          };
          cookies: {
            label: string;
            placeholder: string;
            hint: string;
          };
          buttons: {
            back: string;
            save: string;
            saving: string;
          };
        };
        colab: {
          title: string;
          step1: string;
          step2: string;
          step3: string;
          step4: string;
          cookieCommand: {
            label: string;
          };
          email: {
            label: string;
            placeholder: string;
          };
          cookies: {
            label: string;
            placeholder: string;
            hint: string;
          };
          buttons: {
            back: string;
            save: string;
            saving: string;
          };
        };
        toasts: {
          saveSuccess: {
            title: string;
            descriptionTemplate: string;
          };
          saveError: {
            title: string;
          };
          copied: {
            title: string;
            description: string;
          };
        };
        errors: {
          emailRequired: {
            title: string;
            description: string;
          };
          cookiesRequired: {
            title: string;
            description: string;
          };
          cookiesInvalid: {
            title: string;
            description: string;
          };
          processingError: {
            title: string;
            fallback: string;
          };
        };
        providers: {
          kaggle: string;
          colab: string;
        };
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
    
    // Edit GPU Worker Dialog
    editWorkerDialog: {
      titleTemplate: string;
      description: string;
      fields: {
        provider: string;
        accountId: string;
        model: string;
        gpu: string;
        status: string;
      };
      placeholders: {
        accountId: string;
        model: string;
        gpu: string;
      };
      statusOptions: {
        healthy: string;
        unhealthy: string;
        offline: string;
        pending: string;
      };
      infoLabels: {
        requests: string;
        avgLatency: string;
        ngrokUrl: string;
      };
      buttons: {
        cancel: string;
        save: string;
      };
      toasts: {
        updateSuccess: string;
        updateSuccessDesc: string;
        updateError: string;
        updateErrorDesc: string;
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
      verbosityLevels: string;
      formality: string;
      formalityDesc: string;
      formalityLevels: string;
      creativity: string;
      creativityDesc: string;
      creativityLevels: string;
      precision: string;
      precisionDesc: string;
      precisionLevels: string;
      persuasiveness: string;
      persuasivenessDesc: string;
      persuasivenessLevels: string;
      empathy: string;
      empathyDesc: string;
      empathyLevels: string;
      enthusiasm: string;
      enthusiasmDesc: string;
      enthusiasmLevels: string;
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
      databaseManagement: {
        header: string;
        description: string;
        actions: {
          createBackup: string;
          downloadBackup: string;
          restoreBackup: string;
          uploadFile: string;
          creating: string;
          restoring: string;
        };
        history: {
          title: string;
          empty: string;
          columns: {
            date: string;
            size: string;
            type: string;
            status: string;
            actions: string;
          };
        };
        restore: {
          confirmTitle: string;
          confirmMessage: string;
          warningMessage: string;
          confirm: string;
          cancel: string;
        };
        toasts: {
          backupCreated: string;
          backupDownloaded: string;
          restoreSuccess: string;
          restoreError: string;
          uploadError: string;
        };
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
      
      // Orphan Scan
      orphanScan: {
        scanComplete: string;
        orphansDetectedTemplate: string; // {{count}} órfãos detectados
        scanError: string;
        buttonTooltip: string;
        scanning: string;
        diagnoseIntegrity: string;
      };
      
      // Table
      table: {
        icons: string;
        name: string;
        slug: string;
        type: string;
        namespaces: string;
        actions: string;
      };
      
      // Edit Dialog (extended)
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
        subtitle: string; // Keep for backward compatibility
        subtitleTemplate: string; // Atualize a configuração do agente {{name}}
        agentName: string;
        slug: string;
        slugAutoGenerated: string;
        description: string;
        systemPrompt: string;
        rootNamespace: string;
        rootNamespaceHelp: string;
        rootNamespacePlaceholder: string;
        subnamespaces: string;
        subnamespacesHelp: string;
        subnamespacesPlaceholder: string;
        cancel: string;
        updating: string;
        saveChanges: string;
        save: string;
        saving: string;
      };
      
      // Delete Dialog
      deleteDialog: {
        title: string;
        description: string;
        cancel: string;
        delete: string;
      };
      
      // Orphan Results Dialog
      orphanDialog: {
        title: string;
        description: string;
        severityHigh: string;
        severityMedium: string;
        severityLow: string;
        orphansTemplate: string; // {{count}} órfãos
        suggestedAction: string;
        noOrphans: string;
        allHealthy: string;
        moduleLabel: string;
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
      contentType: string;
      duplicationStatus: string;
      scanDuplicates: string;
      scanImageDuplicates: string;
      scanning: string;
      scanningImages: string;
      unscanned: string;
      unique: string;
      similar: string;
      exactDuplicates: string;
      loadingHistory: string;
      editItem: string;
      rejectItem: string;
      approveAndPublish: string;
      attention: string;
      content: string;
      titleLabel: string;
      tags: string;
      tagsPlaceholder: string;
      namespaces: string;
      aiDescription: string;
      similarContentDetected: string;
      uniqueContentDetected: string;
      scanDuplicatesComplete: string;
      scanDuplicatesError: string;
      scanImageDuplicatesComplete: string;
      scanImageDuplicatesError: string;
      itemsAnalyzed: string;
      duplicatesDetected: string;
      imagesAnalyzed: string;
      absorptionComplete: string;
      absorptionError: string;
      contentReduced: string;
      reduction: string;
      duplicateOf: string;
      itemsApprovedSuccess: string;
      allPendingApprovedAndPublished: string;
      itemsRejectedSuccess: string;
      itemsFailed: string;
      allPendingRemoved: string;
      descriptionsGenerated: string;
      imagesProcessed: string;
      errorGeneratingDescriptions: string;
    };
    
    // Auto-Approval Configuration
    autoApproval: {
      title: string;
      subtitle: string;
      enabled: string;
      disabled: string;
      globalSettings: string;
      scoreThresholds: string;
      contentFiltering: string;
      namespaceControl: string;
      qualityGates: string;
      enableAutoApproval: string;
      enableAutoReject: string;
      requireAllQualityGates: string;
      minApprovalScore: string;
      maxRejectScore: string;
      sensitiveFlags: string;
      enabledNamespaces: string;
      reviewRange: string;
      scoreRange: string;
      namespaceWildcard: string;
      namespaceWildcardDesc: string;
      addNamespace: string;
      removeNamespace: string;
      flagsDescription: string;
      thresholdWarning: string;
      saveChanges: string;
      testDecision: string;
      testScore: string;
      testFlags: string;
      testNamespaces: string;
      runTest: string;
      decisionResult: string;
      configUpdated: string;
      configError: string;
      errorFallback: string;
      previewErrorFallback: string;
      testDescription: string;
      tooltips: {
        enabled: string;
        minApprovalScore: string;
        maxRejectScore: string;
        sensitiveFlags: string;
        enabledNamespaces: string;
        autoRejectEnabled: string;
        requireAllQualityGates: string;
      };
      placeholders: {
        flags: string;
        namespaces: string;
        testFlags: string;
        testNamespaces: string;
      };
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
    
    // API Debug Page
    apiDebug: {
      title: string;
      subtitle: string;
      testAllApis: string;
      apiWorking: string;
      tokensUsed: string;
      viewHeaders: string;
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
      noDescription: string;
    };
    
    // Images Gallery Page
    imagesGallery: {
      toasts: {
        descriptionUpdated: string;
        descriptionSuccess: string;
        updateError: string;
        imagesDeleted: string;
        deleteError: string;
      };
      placeholders: {
        search: string;
        allSources: string;
        allNamespaces: string;
        newDescription: string;
      };
    };
    
    // Namespace Detail Page
    namespaceDetail: {
      toasts: {
        success: string;
        error: string;
      };
      loading: string;
      notFound: {
        title: string;
        description: string;
      };
      buttons: {
        back: string;
        save: string;
        saving: string;
      };
      tabs: {
        basic: string;
        sliders: string;
        prompt: string;
        triggers: string;
      };
      basic: {
        title: string;
        description: string;
        labels: {
          name: string;
          description: string;
          icon: string;
        };
        placeholders: {
          name: string;
          description: string;
          icon: string;
        };
      };
      sliders: {
        title: string;
        description: string;
        enableLabel: string;
        states: {
          enabled: string;
          disabled: string;
        };
      };
      prompt: {
        title: string;
        description: string;
        labels: {
          mergeStrategy: string;
          customPrompt: string;
        };
        selectOptions: {
          override: string;
          merge: string;
          fallback: string;
        };
        placeholders: {
          prompt: string;
        };
      };
      triggers: {
        title: string;
        description: string;
        labels: {
          priority: string;
          confidenceThreshold: string;
        };
        placeholders: {
          addTrigger: string;
        };
        priorityOptions: {
          high: string;
          medium: string;
          low: string;
        };
      };
      fallbacks: {
        noDescription: string;
      };
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
    
    // Namespaces Page - PHASE 2 EXPANDED
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
      
      // PHASE 2: Slider Overrides
      sliders: {
        title: string;
        subtitle: string;
        useGlobalSettings: string;
        customizeForNamespace: string;
        persuasiveness: string;
        persuasivenessDesc: string;
        professionalism: string;
        professionalismDesc: string;
        friendliness: string;
        friendlinessDesc: string;
        assertiveness: string;
        assertivenessDesc: string;
        creativity: string;
        creativityDesc: string;
        formality: string;
        formalityDesc: string;
        empathy: string;
        empathyDesc: string;
        resetToGlobal: string;
        globalValue: string;
        customValue: string;
      };
      
      // PHASE 2: System Prompt Override
      systemPrompt: {
        title: string;
        subtitle: string;
        globalPrompt: string;
        namespacePrompt: string;
        placeholder: string;
        mergeStrategy: string;
        mergeStrategyDesc: string;
        append: string;
        prepend: string;
        replace: string;
        appendDesc: string;
        prependDesc: string;
        replaceDesc: string;
        preview: string;
        finalPrompt: string;
      };
      
      // PHASE 2: Triggers & Priority
      triggers: {
        title: string;
        subtitle: string;
        add: string;
        keyword: string;
        keywordDesc: string;
        pattern: string;
        patternDesc: string;
        semanticMatch: string;
        semanticMatchDesc: string;
        examples: string;
        examplesPlaceholder: string;
        priority: string;
        priorityDesc: string;
        confidence: string;
        confidenceDesc: string;
        remove: string;
        noTriggers: string;
      };
      
      // PHASE 2: Analytics
      analytics: {
        title: string;
        subtitle: string;
        usageStats: string;
        detections: string;
        detectionsDesc: string;
        avgConfidence: string;
        avgConfidenceDesc: string;
        sliderImpact: string;
        sliderImpactDesc: string;
        promptOverrides: string;
        promptOverridesDesc: string;
        performance: string;
        avgLatency: string;
        successRate: string;
        topTriggers: string;
        noData: string;
        overrides: string;
        none: string;
        priority: string;
      };
      
      validation: {
        nameRequired: string;
        nameRequiredDesc: string;
        invalidRootFormat: string;
        rootNoSlash: string;
        parentRequired: string;
        selectParentDesc: string;
        invalidFormat: string;
        subFormatError: string;
        sliderOutOfBounds: string;
        sliderOutOfBoundsDesc: string;
        priorityRequired: string;
        confidenceOutOfBounds: string;
      };
      toast: {
        created: string;
        updated: string;
        deleted: string;
        contentQueued: string;
        indexError: string;
        unknownError: string;
        customVersionCreated: string;
        slidersSaved: string;
        promptSaved: string;
        triggerAdded: string;
        triggerRemoved: string;
        contentPendingHITL: string;
        additionalContentPendingHITL: string;
      };
      
      pendingApprovalDesc: string;
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
      save: "Salvar",
      saving: "Salvando...",
      cancel: "Cancelar",
      delete: "Excluir",
      deleting: "Excluindo...",
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
      addedSuccess: "Adicionado com sucesso!",
      removedSuccess: "Removido com sucesso!",
      approvedSuccess: "Aprovado com sucesso!",
      rejectedSuccess: "Rejeitado",
      approveError: "Erro ao aprovar",
      rejectError: "Erro ao rejeitar",
      selectAtLeastOne: "Selecione pelo menos um item",
      search: "Pesquisa",
      processingFiles: "Processando",
      files: "arquivo(s)",
      processedAndIndexed: "processado(s) e indexado(s)",
      failedToProcess: "Falha ao processar arquivos",
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
        today24h: "24h (Hoje)",
        history: "Histórico",
        todayUsageUtc: "Uso Hoje (UTC reset)",
        totalHistory: "Histórico Total",
        tokens: "Tokens",
        autoEvolution: "Auto-Evolução",
        conversations: "Conversas",
        highQuality: "Alta Qualidade",
        datasetsKb: "Datasets KB",
        jobs: "Jobs",
        autoLearningSystem: "Sistema de auto-aprendizado",
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
          urlWarningWithUrl: "Aviso: protocolo adicionado automaticamente - {{url}}",
          webSearchSuccess: "Conhecimentos adicionados com sucesso!",
          webSearchWithCountAndQuery: "{{count}} conhecimentos da pesquisa '{{query}}'",
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
            namespaces: {
              label: "Namespaces (Multi-Agentes):",
              help: "Selecione quais agentes terão acesso a este conhecimento",
            },
          },
          learnUrl: {
            title: "Aprender de um Link",
            description: "AION vai acessar o link e aprender todo o conteúdo",
            urlPlaceholder: "https://example.com/artigo",
            learning: "Aprendendo...",
            learnFromThisUrl: "Aprender deste Link",
            learningMode: "Modo de Aprendizado:",
            singlePage: "Aprender da Página - Scan completo somente desta página/link",
            deepCrawl: "Aprender Completo - Scan de todas as páginas e sublinks",
            downloadMedia: "Baixar também imagens e vídeos (além do texto)",
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
          source: "Fonte:",
          save: "Salvar",
          cancel: "Cancelar",
          confirmDelete: "Remover este conhecimento?",
          editTitlePlaceholder: "Título do conhecimento",
          editContentPlaceholder: "Conteúdo do conhecimento",
          sourceTypes: {
            manual: "manual",
            url: "link",
            websearch: "busca web",
            file: "arquivo",
          },
        },
        
        cascade: {
          dialog: {
            title: "Excluir Documento - Análise de Impacto em Cascata",
            aboutToDelete: "Você está prestes a excluir: {{title}}",
            analyzingImpact: "Analisando impacto em cascata...",
            loadError: "Falha ao carregar grafo de dependências: {{error}}",
            cascadeImpactLabel: "Impacto em Cascata:",
            willAffectTemplate: "Esta exclusão afetará {{datasets}} datasets e {{models}} modelos",
            modelsTaintedSuffix: "({{count}} modelos já marcados)",
            noImpact: "Nenhum impacto em cascata detectado. Este documento não é usado por nenhum dataset ou modelo.",
            affectedDatasetsTitle: "Datasets Afetados ({{count}})",
            affectedModelsTitle: "Modelos Afetados ({{count}})",
            datasetVersion: "Dataset #{{id}} v{{version}}",
            taintedBadge: "Marcado",
            deletionReasonLabel: "Motivo da Exclusão",
            deletionReasonRequired: "*",
            selectReasonPlaceholder: "Selecione o motivo",
            reasonQuality: "Problemas de Qualidade",
            reasonDuplicate: "Conteúdo Duplicado",
            reasonExpired: "Expirado/Desatualizado",
            reasonRequest: "Solicitação do Usuário",
            reasonGdpr: "Conformidade LGPD/GDPR",
            gdprReasonLabel: "Motivo Específico LGPD/GDPR",
            gdprReasonRequired: "*",
            gdprReasonPlaceholder: "Ex: Direito ao esquecimento, Minimização de dados",
            retentionDaysLabel: "Retenção do Registro (dias)",
            retentionPlaceholder: "Deixe vazio para retenção permanente",
            retentionHint: "Quanto tempo manter o registro de auditoria da exclusão (vazio = para sempre)",
            deleteButtonLabel: "Excluir Documento",
          },
          status: {
            active: "Ativo",
            tainted: "Marcado",
            deleted: "Excluído",
            pending: "Pendente",
          },
          toasts: {
            validationErrorTitle: "Erro de Validação",
            selectReasonError: "Por favor, selecione um motivo de exclusão",
            gdprReasonRequiredTitle: "Motivo LGPD/GDPR Obrigatório",
            gdprReasonRequiredDesc: "Por favor, forneça um motivo específico para exclusão por LGPD/GDPR",
            deleteSuccessTitle: "Documento excluído com sucesso",
            deleteSuccessDescTemplate: "Exclusão completa: {{datasets}} datasets e {{models}} modelos afetados",
          },
        },
        
        states: {
          loading: "Carregando...",
          noDocuments: "Nenhum conhecimento encontrado. Adicione novos conhecimentos acima!",
        },
      },
      
      gpuManagement: {
        title: "Gerenciamento de GPUs",
        subtitle: "Gerencie workers de GPU e load balancing",
        
        // Header
        header: {
          title: "Gerenciamento de GPUs",
          subtitle: "Controle centralizado para todos os GPU workers",
          addGpu: "Adicionar GPU",
        },
        
        // Stats Cards
        stats: {
          totalWorkers: "Total de Workers",
          autoManualTemplate: "{auto} auto / {manual} manual",
          online: "Online",
          offlineUnhealthyTemplate: "{offline} offline · {unhealthy} não saudáveis",
          totalRequests: "Total de Requisições",
          avgLatency: "Latência Média",
          msUnit: "ms",
        },
        
        // Table
        table: {
          title: "GPU Workers",
          headers: {
            id: "ID",
            type: "Tipo",
            provider: "Provedor",
            account: "Conta",
            gpu: "GPU",
            status: "Status",
            quota: "Quota",
            requests: "Requisições",
            latency: "Latência",
            actions: "Ações",
          },
          na: "N/D",
        },
        
        // Badges
        badges: {
          online: "Online",
          offline: "Offline",
          unhealthy: "Não Saudável",
          pending: "Pendente",
          auto: "Auto",
          manual: "Manual",
        },
        
        // Quota
        quota: {
          sessionTemplate: "Sessão: {used}h / {max}h",
          weekTemplate: "Semana: {used}h / {max}h",  // Dynamic max (21h = 70% of 30h)
          hourUnit: "h",
        },
        
        // Empty State
        emptyState: {
          message: "Nenhum GPU worker configurado",
          addFirstGpu: "Adicionar Sua Primeira GPU",
        },
        
        // Dialogs
        dialogs: {
          addWorkerTitle: "Adicionar GPU Worker",
          chooseMethod: "Escolha o método de provisionamento:",
          comingSoon: "Em Breve",
          kaggleDesc: "Provisionamento automático via Kaggle estará disponível em breve",
          colabDesc: "Provisionamento automático via Colab estará disponível em breve",
          manualDesc: "Adição manual de GPU estará disponível em breve",
          kaggleButton: "Auto-Provisionar Kaggle",
          colabButton: "Auto-Provisionar Colab",
          manualButton: "Adicionar Worker Manual",
        },
        
        // NEW: Tabs Navigation
        tabs: {
          overview: "Visão Geral",
          auth: "Autenticação",
          quotas: "Quotas",
          timeline: "Timeline",
          workersCount: "Workers ({count})",
        },
        
        // NEW: Auto-Refresh Configuration
        autoRefresh: {
          title: "Configuração de Auto-Refresh",
          description: "Frequência de atualização automática dos dados de quota",
          interval: "Intervalo:",
          intervalOptions: {
            tenSeconds: "10 segundos",
            thirtySeconds: "30 segundos",
            oneMinute: "1 minuto",
            fiveMinutes: "5 minutos",
          },
          status: {
            stale: "Dados desatualizados (>10min)",
            updated: "Dados atualizados",
          },
        },
        
        // NEW: Authentication Section
        auth: {
          title: "Autenticação Google (Kaggle + Colab)",
          description: "Configure acesso seguro às plataformas de GPU via Google OAuth",
          statusTitle: "Status de Autenticação",
          accountsConnectedCount: "{count} conta(s) conectada(s)",
          addAccount: "Adicionar Conta",
          connectAccount: "Conectar Conta",
          connectedAccountsTitle: "Contas Conectadas:",
          providers: "Provedores:",
          valid: "Válido",
          expired: "Expirado",
          // Auth status badges
          authenticated: "Autenticado",
          notAuthenticated: "Não Autenticado",
          expiringSoon: "Expirando em Breve",
          // QuotaProviderCard keys
          loginRequired: "Login Necessário",
        },
        
        // NEW: Quotas Section
        quotas: {
          title: "Quotas de GPU em Tempo Real",
          syncButton: "Sincronizar Agora",
          syncing: "Sincronizando...",
          emptyMessage: "Nenhuma quota disponível. Conecte uma conta Google para começar.",
          emptyAction: "Conectar Conta Google",
          // QuotaProviderCard keys
          noData: "Sem Dados",
          staleData: "Dados Desatualizados",
          scrapedAt: "Atualizado",
          kaggle: {
            sessionRemaining: "Sessão Restante",
            sessionMax: "Máx. Sessão",
            weeklyUsed: "Usado Semana",
            weeklyRemaining: "Restante Semana",
            canStart: "Pode Iniciar",
            shouldStop: "Deve Parar",
          },
          colab: {
            computeUnitsUsed: "Unidades Usadas",
            computeUnitsRemaining: "Unidades Restantes",
            sessionRemaining: "Sessão Restante",
            inCooldown: "Em Cooldown",
          },
          // Boolean labels
          yes: "Sim",
          no: "Não",
        },
        
        // NEW: Usage History Section
        usageHistory: {
          title: "Histórico de Uso",
          description: "Gráfico de consumo de quota ao longo do tempo",
          noData: "Nenhum dado histórico disponível",
          timeRanges: {
            oneHour: "1 Hora",
            sixHours: "6 Horas",
            twentyFourHours: "24 Horas",
            sevenDays: "7 Dias",
            thirtyDays: "30 Dias",
          },
          thresholds: {
            warning: "Atenção (70%)",
            critical: "Crítico (85%)",
            emergency: "Emergência (95%)",
          },
          providers: {
            kaggle: "Kaggle",
            colab: "Colab",
          },
          aria: {
            timeRangeSelector: "Seletor de período de tempo",
          },
        },
        
        // NEW: Timeline Section
        timeline: {
          title: "Timeline de Sessões",
          description: "Visualização das sessões ativas, cooldowns e próximas disponibilidades",
          emptyMessage: "Nenhuma sessão disponível. Conecte uma conta Google para visualizar a timeline.",
          noSessions: "Nenhuma sessão ativa",
          remaining: "Restante",
          cooldown: "Cooldown",
          readyToStart: "Pronto para iniciar",
          canStart: "Pode iniciar",
          cannotStart: "Não pode iniciar",
          shouldStop: "Deve parar",
          okToContinue: "OK para continuar",
          status: {
            idle: "Ocioso",
            active: "Ativo",
            cooldown: "Em Espera",
            available: "Disponível",
          },
          labels: {
            placeholder: "-",
          },
        },
        
        // NEW: Quota Alerts
        quotaAlerts: {
          dismiss: "Dispensar alerta",
          titleTemplate: "{provider} Alerta de Quota - {percentage}% Usado",
          syncButton: "Sincronizar Agora",
          emergencyAction: "⚠️ Ação imediata necessária - reduza a carga de trabalho ou arrisque esgotamento de quota",
          criticalWarning: "⚠️ Uso elevado detectado - considere reduzir a carga de trabalho",
        },
        
        // NEW: Time Templates
        timeTemplates: {
          week: "Semana: {used}h / {max}h",
          session: "Sessão: {used}h / {max}h",
        },
        
        // NEW: Overview Cards (QuotaOverviewCard + GPUWorkersCard)
        overviewCards: {
          quotaCard: {
            title: "Status de Quotas GPU",
            subtitle: "Monitore o uso de GPU em tempo real",
            emptyState: {
              noAccount: "Nenhuma conta Google conectada",
              connectHint: "Conecte uma conta para monitorar quotas",
              connectButton: "Conectar Conta",
            },
            alertLevels: {
              normal: "Normal",
              warning: "Atenção",
              critical: "Crítico",
              emergency: "Emergência",
            },
            stale: "Desatualizado",
            descriptionFull: "Monitore o consumo de GPU Kaggle e Colab em tempo real",
            kaggle: {
              errorTitle: "Kaggle: Erro ao Obter Quotas",
              errorFallback: "Falha ao conectar com Kaggle. Tente sincronizar novamente.",
              noDataTitle: "Kaggle: Dados Indisponíveis",
              noDataDesc: "Nenhum dado de quota disponível. Execute uma sincronização manual.",
              label: "Kaggle",
              modeBadge: "On-Demand + Idle (10min)",
              weeklyTemplate: "Semanal: {used}h / {max}h",
              percentUsed: "% usado",
              canStart: "Pode iniciar",
              quotaExhausted: "Quota esgotada",
            },
            colab: {
              errorTitle: "Colab: Erro ao Obter Quotas",
              errorFallback: "Falha ao conectar com Google Colab. Tente sincronizar novamente.",
              noDataTitle: "Colab: Dados Indisponíveis",
              noDataDesc: "Nenhum dado de quota disponível. Execute uma sincronização manual.",
              label: "Google Colab",
              modeBadge: "Schedule Fixo (36h cooldown)",
              unitsTemplate: "Unidades: {used} / {max}",
              percentUsed: "% usado",
              canStart: "Pode iniciar",
              inCooldown: "Em cooldown",
            },
            actions: {
              viewDetails: "Ver Detalhes Completos",
              sync: "Sincronizar",
              syncing: "Sincronizando...",
            },
          },
          workersCard: {
            title: "GPU Workers",
            loading: "Monitorando workers de GPU...",
            manage: "Gerencie workers de GPU",
            emptyState: {
              noWorkers: "Nenhum worker GPU registrado",
              addHint: "Adicione um worker para começar",
              addButton: "Adicionar Worker",
            },
            healthLevels: {
              excellent: "Excelente",
              good: "Bom",
              degraded: "Degradado",
              critical: "Crítico",
            },
            poolDescriptionSingular: "Pool de {count} worker GPU",
            poolDescriptionPlural: "Pool de {count} workers GPU",
            statusLabels: {
              healthy: "Healthy",
              unhealthy: "Unhealthy",
              offline: "Offline",
            },
            metrics: {
              totalRequests: "Total Requests",
              avgLatency: "Avg Latency",
            },
            actions: {
              viewAll: "Ver Todos ({count})",
              add: "Adicionar",
            },
          },
        },
        
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
        
        // Google Auth Dialog - PT-BR (66 keys)
        googleAuthDialog: {
          dialog: {
            trigger: "Conectar Conta Google",
            title: "Autenticação Google - Kaggle & Colab",
            description: "Configure acesso seguro às plataformas de GPU com criptografia AES-256-GCM",
          },
          tabs: {
            instructions: "1. Instruções",
            kaggle: "2. Kaggle",
            colab: "3. Colab",
          },
          instructions: {
            howItWorks: {
              title: "Como funciona",
              description: "Você fará login manualmente UMA VEZ no Google. Depois, copiaremos os cookies de autenticação e os salvaremos de forma criptografada. O sistema fará scraping automático das quotas a cada 10 minutos, sem precisar de login novamente por ~30 dias.",
            },
            prerequisites: {
              title: "Pré-requisitos",
              chrome: "Navegador Google Chrome (recomendado para compatibilidade)",
              account: "Conta Google com acesso ao Kaggle e/ou Google Colab",
              devtools: "DevTools aberto (F12) para copiar cookies",
            },
            security: {
              title: "Segurança",
              encryption: "Cookies criptografados com AES-256-GCM usando SESSION_SECRET",
              noPlaintext: "Nenhum cookie armazenado em texto plano",
              autoValidation: "Validação automática a cada sync (10min)",
              expiration: "Expiração após 30 dias (com avisos antecipados)",
            },
            warning: {
              title: "⚠️ IMPORTANTE - Risco de BAN",
              kaggle: "<strong>Kaggle:</strong> Max 8.4h/sessão, 21h/semana. Violação = BAN PERMANENTE.",
              colab: "<strong>Colab:</strong> Max 8.4h/sessão, 36h cooldown. Violação = BAN PERMANENTE.",
              auto: "O sistema respeita automaticamente esses limites via quota scraping.",
            },
            buttons: {
              kaggle: "Conectar Kaggle",
              colab: "Conectar Colab",
            },
          },
          kaggle: {
            title: "Passo a passo - Kaggle",
            step1: "Abra www.kaggle.com em nova aba",
            step2: "Faça login com sua conta Google",
            step3: "Abra DevTools (F12) → Console → Cole o comando abaixo",
            step4: "Copie o resultado e cole no campo \"Cookies\" abaixo",
            cookieCommand: {
              label: "Comando para copiar cookies (Cole no Console do DevTools):",
            },
            email: {
              label: "Email da conta Google",
              placeholder: "seu-email@gmail.com",
            },
            cookies: {
              label: "Cookies (Cole o resultado do Console)",
              placeholder: "KAGGLE_KEY=value; KAGGLE_USER_ID=123; ...",
              hint: "Formato esperado: name1=value1; name2=value2; ...",
            },
            buttons: {
              back: "Voltar",
              save: "Salvar Kaggle",
              saving: "Salvando...",
            },
          },
          colab: {
            title: "Passo a passo - Google Colab",
            step1: "Abra colab.research.google.com em nova aba",
            step2: "Faça login com sua conta Google",
            step3: "Abra DevTools (F12) → Console → Cole o comando abaixo",
            step4: "Copie o resultado e cole no campo \"Cookies\" abaixo",
            cookieCommand: {
              label: "Comando para copiar cookies (Cole no Console do DevTools):",
            },
            email: {
              label: "Email da conta Google",
              placeholder: "seu-email@gmail.com",
            },
            cookies: {
              label: "Cookies (Cole o resultado do Console)",
              placeholder: "GOOGLE_SESSION=value; GOOGLE_USER=123; ...",
              hint: "Formato esperado: name1=value1; name2=value2; ...",
            },
            buttons: {
              back: "Voltar",
              save: "Salvar Colab",
              saving: "Salvando...",
            },
          },
          toasts: {
            saveSuccess: {
              title: "✅ Autenticação salva",
              descriptionTemplate: "Cookies do {{provider}} salvos com sucesso para {{email}}",
            },
            saveError: {
              title: "❌ Erro ao salvar autenticação",
            },
            copied: {
              title: "✅ Copiado!",
              description: "Comando copiado para área de transferência",
            },
          },
          errors: {
            emailRequired: {
              title: "Email obrigatório",
              description: "Por favor, informe o email da sua conta Google",
            },
            cookiesRequired: {
              title: "Cookies obrigatórios",
              description: "Por favor, cole os cookies copiados do navegador",
            },
            cookiesInvalid: {
              title: "Cookies inválidos",
              description: "Não foi possível extrair cookies válidos do texto colado",
            },
            processingError: {
              title: "Erro ao processar cookies",
              fallback: "Formato inválido",
            },
          },
          providers: {
            kaggle: "Kaggle",
            colab: "Colab",
          },
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
      
      editWorkerDialog: {
        titleTemplate: "Editar GPU Worker #{id}",
        description: "Atualizar informações e configurações do worker",
        fields: {
          provider: "Provider",
          accountId: "Account ID",
          model: "Model",
          gpu: "GPU Type",
          status: "Status",
        },
        placeholders: {
          accountId: "Email ou username",
          model: "TinyLlama-1.1B-Chat",
          gpu: "Tesla T4",
        },
        statusOptions: {
          healthy: "Healthy",
          unhealthy: "Unhealthy",
          offline: "Offline",
          pending: "Pending",
        },
        infoLabels: {
          requests: "Requests:",
          avgLatency: "Avg Latency:",
          ngrokUrl: "Ngrok URL:",
        },
        buttons: {
          cancel: "Cancelar",
          save: "Salvar Alterações",
        },
        toasts: {
          updateSuccess: "Worker atualizado",
          updateSuccessDesc: "As alterações foram salvas com sucesso",
          updateError: "Erro ao atualizar",
          updateErrorDesc: "Falha ao atualizar worker",
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
        verbosityLevels: "0-20%: muito conciso | 21-40%: conciso | 41-60%: balanceado | 61-80%: detalhado | 81-100%: muito detalhado",
        formality: "Formalidade",
        formalityDesc: "0% = Casual e amigável | 100% = Formal e profissional",
        formalityLevels: "0-20%: super casual | 21-40%: casual | 41-60%: semi-formal | 61-80%: formal | 81-100%: muito formal",
        creativity: "Criatividade",
        creativityDesc: "0% = Somente fatos objetivos | 100% = Usa metáforas, analogias e linguagem criativa",
        creativityLevels: "0-20%: puramente factual | 21-40%: factual/literal | 41-60%: balanceado | 61-80%: criativo | 81-100%: altamente criativo",
        precision: "Precisão",
        precisionDesc: "0% = Números aproximados e estimativas | 100% = Números exatos e fontes citadas",
        precisionLevels: "0-20%: muito aproximado | 21-40%: aproximado | 41-60%: balanceado | 61-80%: preciso | 81-100%: extremamente preciso",
        persuasiveness: "Persuasão",
        persuasivenessDesc: "0% = Apresenta fatos neutros | 100% = Usa técnicas persuasivas e argumentos fortes",
        persuasivenessLevels: "0-20%: puramente informativo | 21-40%: neutro/informativo | 41-60%: moderadamente persuasivo | 61-80%: persuasivo | 81-100%: altamente persuasivo",
        empathy: "Empatia",
        empathyDesc: "0% = Objetivo e factual | 100% = Mostra empatia e consideração emocional",
        empathyLevels: "0-20%: puramente objetivo | 21-40%: objetivo/factual | 41-60%: empatia balanceada | 61-80%: empático | 81-100%: altamente empático",
        enthusiasm: "Entusiasmo",
        enthusiasmDesc: "0% = Tom calmo e reservado | 100% = Energia alta e linguagem expressiva!",
        enthusiasmLevels: "0-20%: muito calmo | 21-40%: calmo/reservado | 41-60%: moderadamente entusiasmado | 61-80%: entusiasmado | 81-100%: muito entusiasmado",
        systemPrompt: "System Prompt",
        systemPromptDesc: "Instruções base para o comportamento da IA",
        systemPromptPlaceholder: "Digite o system prompt...",
        viewFullPrompt: "Ver Prompt Completo",
        previewModal: {
          title: "System Prompt Completo",
          description: "Os 7 sliders de comportamento geraram automaticamente este system prompt, que define como o AION se comporta em TODAS as suas respostas (usando GPU próprio ou qualquer API externa).",
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
        databaseManagement: {
          header: "Gerenciamento de Banco de Dados",
          description: "Crie backups completos do banco de dados e restaure de backups anteriores",
          actions: {
            createBackup: "Criar Backup",
            downloadBackup: "Baixar",
            restoreBackup: "Restaurar Backup",
            uploadFile: "Enviar arquivo de backup",
            creating: "Criando backup...",
            restoring: "Restaurando...",
          },
          history: {
            title: "Histórico de Backups",
            empty: "Nenhum backup encontrado",
            columns: {
              date: "Data",
              size: "Tamanho",
              type: "Tipo",
              status: "Status",
              actions: "Ações",
            },
          },
          restore: {
            confirmTitle: "Confirmar Restauração",
            confirmMessage: "Tem certeza que deseja restaurar este backup?",
            warningMessage: "Esta ação criará um snapshot de segurança do estado atual antes de restaurar. Todos os dados serão substituídos pelo conteúdo do backup.",
            confirm: "Restaurar",
            cancel: "Cancelar",
          },
          toasts: {
            backupCreated: "Backup criado com sucesso!",
            backupDownloaded: "Backup baixado com sucesso!",
            restoreSuccess: "Banco de dados restaurado com sucesso!",
            restoreError: "Erro ao restaurar backup",
            uploadError: "Erro ao enviar arquivo de backup",
          },
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
        loading: "Carregando...",
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
        
        orphanScan: {
          scanComplete: "Scan completo",
          orphansDetectedTemplate: "{{count}} órfãos detectados",
          scanError: "Erro ao executar scan",
          buttonTooltip: "Escaneia toda a plataforma em busca de dados órfãos (sem referências válidas) - apenas diagnóstico, não deleta nada",
          scanning: "Escaneando...",
          diagnoseIntegrity: "Diagnosticar Integridade",
        },
        
        table: {
          icons: "Ícones",
          name: "Nome",
          slug: "Slug",
          type: "Tipo",
          namespaces: "Namespaces",
          actions: "Ações",
        },
        
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
          subtitleTemplate: "Atualize a configuração do agente {{name}}",
          agentName: "Nome do Agente",
          slug: "Identificador (Slug)",
          slugAutoGenerated: "Gerado automaticamente pelo sistema - não editável",
          description: "Descrição",
          systemPrompt: "System Prompt",
          rootNamespace: "Namespace Raiz",
          rootNamespaceHelp: "Agents trabalham em 1 namespace raiz (ex: 'financas', 'tech')",
          rootNamespacePlaceholder: "Selecione 1 namespace raiz",
          subnamespaces: "Subnamespaces",
          subnamespacesHelp: "SubAgents podem ter múltiplos subnamespaces do mesmo namespace pai",
          subnamespacesPlaceholder: "Selecione subnamespaces",
          cancel: "Cancelar",
          updating: "Atualizando...",
          saveChanges: "Salvar Alterações",
          subtitle: "Atualize as informações do agente",
          save: "Salvar",
          saving: "Salvando...",
        },
        
        deleteDialog: {
          title: "Confirmar Exclusão",
          description: "Tem certeza que deseja excluir este agente? Esta ação não pode ser desfeita. O agente será removido permanentemente do sistema.",
          cancel: "Cancelar",
          delete: "Excluir",
        },
        
        orphanDialog: {
          title: "Diagnóstico de Integridade da Plataforma",
          description: "Recursos órfãos detectados em todos os módulos do sistema",
          severityHigh: "Severidade Alta",
          severityMedium: "Severidade Média",
          severityLow: "Severidade Baixa",
          orphansTemplate: "{{count}} órfãos",
          suggestedAction: "Ação Sugerida:",
          noOrphans: "Nenhum órfão detectado",
          allHealthy: "Todos os módulos da plataforma estão saudáveis!",
          moduleLabel: "Módulo",
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
        note: "Nota",
        attachments: "Anexos",
        viewAttachment: "Ver anexo",
        all: "Todos",
        pages: "Páginas",
        images: "Imagens",
        contentType: "Tipo de Conteúdo",
        duplicationStatus: "Status de Duplicação",
        scanDuplicates: "Escanear Duplicatas",
        scanImageDuplicates: "Escanear Imagens Duplicadas",
        scanning: "Escaneando...",
        scanningImages: "Escaneando Imagens...",
        unscanned: "Não Escaneados",
        unique: "Únicos",
        similar: "Similares",
        exactDuplicates: "Duplicatas Exatas",
        loadingHistory: "Carregando histórico...",
        editItem: "Editar Item de Curadoria",
        rejectItem: "Rejeitar Item",
        approveAndPublish: "Aprovar e Publicar",
        attention: "ATENÇÃO:",
        content: "Conteúdo",
        titleLabel: "Título",
        tags: "Tags",
        tagsPlaceholder: "Tags (separadas por vírgula)",
        namespaces: "Namespaces:",
        aiDescription: "✓ Descrição AI",
        similarContentDetected: "Conteúdo similar detectado",
        uniqueContentDetected: "Conteúdo único - sem duplicatas detectadas",
        scanDuplicatesComplete: "Scan de duplicatas concluído!",
        scanDuplicatesError: "Erro ao escanear duplicatas",
        scanImageDuplicatesComplete: "Scan de imagens duplicadas concluído!",
        scanImageDuplicatesError: "Erro ao escanear imagens duplicadas",
        itemsAnalyzed: "itens analisados",
        duplicatesDetected: "duplicatas detectadas",
        imagesAnalyzed: "imagens analisadas",
        absorptionComplete: "Absorção parcial concluída!",
        absorptionError: "Erro ao absorver conteúdo",
        contentReduced: "Conteúdo reduzido de",
        reduction: "de redução",
        duplicateOf: "Duplicado de:",
        itemsApprovedSuccess: "itens aprovados com sucesso!",
        allPendingApprovedAndPublished: "Todos os itens pendentes foram aprovados e publicados na KB",
        itemsRejectedSuccess: "itens rejeitados com sucesso!",
        itemsFailed: "itens falharam",
        allPendingRemoved: "Todos os itens pendentes foram removidos da fila",
        descriptionsGenerated: "Descrições geradas com sucesso!",
        imagesProcessed: "imagens processadas",
        errorGeneratingDescriptions: "Erro ao gerar descrições",
        selectAll: "Selecionar todos",
        selectedCount: "selecionados",
        approveSelected: "Aprovar Selecionadas",
        rejectSelected: "Rejeitar Selecionadas",
        approveAllPending: "Aprovar Todas Pendentes",
        rejectAllPending: "Rejeitar Todas Pendentes",
        edit: "Editar",
        duplicate: "Duplicata",
        video: "Vídeo",
        image: "Imagem",
        previewAbsorption: "Preview Absorção",
        previewAbsorptionTooltip: "Preview da absorção inteligente - extrair apenas conteúdo novo",
        playVideo: "Reproduzir vídeo",
        viewImage: "Ver imagem",
        videos: "Vídeos",
        unknown: "Desconhecido",
        characters: "caracteres",
        generating: "Gerando...",
        generateDescriptionsAI: "🤖 Gerar Descrições AI",
        adjustTitleTags: "Ajuste título e tags antes de aprovar",
        editContentLabel: "Editar Conteúdo",
        editContentHelp: "Edite o conteúdo extraído se necessário antes de aprovar",
        imagesAttached: "Imagens Anexadas",
        allImagesIndexed: "Todas as imagens serão indexadas junto com o conteúdo após aprovação",
        tagsSeparated: "Tags (separadas por vírgula)",
        noteOptional: "Nota (opcional)",
        observationsPlaceholder: "Observações sobre este conteúdo",
        confirmApproveDesc: "Tem certeza que deseja aprovar e publicar este conteúdo na Knowledge Base? Esta ação não pode ser desfeita.",
        rejectReasonOptional: "Por que este conteúdo está sendo rejeitado? (opcional)",
        rejectMotivo: "Motivo da rejeição",
        publishing: "Publicando...",
        rejecting: "Rejeitando...",
        approveItemsCount: "Aprovar {count} Itens Selecionados",
        confirmBulkApproveDesc: "Tem certeza que deseja aprovar e publicar {count} itens na Knowledge Base? Todos serão indexados e disponibilizados para treinamento.",
        duplicateExactTitle: "Duplicata exata detectada ({percent}% similar)",
        similarContentTitle: "Conteúdo similar detectado ({percent}% similar)",
        uniqueImageTitle: "Imagem única",
        duplicateExactImageTitle: "Duplicata exata ({percent}%)",
        similarImageTitle: "Imagem similar ({percent}%)",
        cancelar: "Cancelar",
        bulkApproveSuccess: "{count} itens aprovados com sucesso!",
        bulkApproveFailed: "{count} itens falharam",
        absorptionCompleteTitle: "Absorção parcial concluída!",
        absorptionCompleteDesc: "Conteúdo reduzido de {before} para {after} caracteres ({reduction}% de redução)",
        approveAllWarning: "ATENÇÃO: Esta ação irá aprovar e publicar TODOS os {count} itens pendentes na Knowledge Base. Todos serão indexados imediatamente e disponibilizados para treinamento quando atingir 100 exemplos. Esta ação não pode ser desfeita.",
        rejectAllWarning: "ATENÇÃO: Esta ação irá rejeitar e remover TODOS os {count} itens pendentes da fila de curadoria. Nenhum conteúdo será publicado na Knowledge Base ou usado para treinamento. Esta ação não pode ser desfeita.",
        approveAllTitle: "Aprovar Todos os {count} Itens",
        rejectAllTitle: "Rejeitar Todos os {count} Itens",
        noDescription: "Sem descrição",
        emptyHistory: "Nenhum item {filter} no histórico (retenção: 5 anos)",
        approvedStatus: "Aprovado",
        rejectedStatus: "Rejeitado",
        reviewedBy: "por {reviewer} em {date} às {time}",
        filterPages: "páginas",
        filterImages: "imagens",
      },
      
      autoApproval: {
        title: "Auto-Aprovação",
        subtitle: "Configure thresholds e regras para aprovação automática de conteúdo",
        enabled: "Ativado",
        disabled: "Desativado",
        globalSettings: "Configurações Globais",
        scoreThresholds: "Thresholds de Qualidade",
        contentFiltering: "Filtragem de Conteúdo",
        namespaceControl: "Controle de Namespaces",
        qualityGates: "Quality Gates",
        enableAutoApproval: "Habilitar Auto-Aprovação",
        enableAutoReject: "Habilitar Auto-Rejeição",
        requireAllQualityGates: "Exigir Todos os Quality Gates",
        minApprovalScore: "Score Mínimo para Aprovação",
        maxRejectScore: "Score Máximo para Rejeição",
        sensitiveFlags: "Flags Sensíveis",
        enabledNamespaces: "Namespaces Habilitados",
        reviewRange: "Faixa de Revisão Manual",
        scoreRange: "Faixa de Score",
        namespaceWildcard: "Curinga de Namespace",
        namespaceWildcardDesc: "Use '*' para permitir todos os namespaces",
        addNamespace: "Adicionar Namespace",
        removeNamespace: "Remover Namespace",
        flagsDescription: "Flags que sempre requerem revisão humana (adult, violence, medical, financial, pii)",
        thresholdWarning: "Score de rejeição deve ser menor que score de aprovação",
        saveChanges: "Salvar Alterações",
        testDecision: "Testar Decisão",
        testScore: "Score de Teste",
        testFlags: "Flags de Teste",
        testNamespaces: "Namespaces de Teste",
        runTest: "Executar Teste",
        decisionResult: "Resultado da Decisão",
        configUpdated: "Configuração atualizada com sucesso",
        configError: "Erro ao atualizar configuração",
        errorFallback: "Erro desconhecido",
        previewErrorFallback: "Falha ao visualizar decisão",
        testDescription: "Teste como a lógica de auto-aprovação trataria conteúdo específico",
        tooltips: {
          enabled: "Ativa/desativa aprovação automática globalmente",
          minApprovalScore: "Conteúdo com score >= este valor será aprovado automaticamente",
          maxRejectScore: "Conteúdo com score < este valor será rejeitado automaticamente",
          sensitiveFlags: "Conteúdo com estas flags sempre vai para revisão manual",
          enabledNamespaces: "Namespaces permitidos para auto-aprovação (* = todos)",
          autoRejectEnabled: "Permite rejeição automática de conteúdo de baixa qualidade",
          requireAllQualityGates: "Se ativado, conteúdo deve passar por todos os 5 quality gates",
        },
        placeholders: {
          flags: "adult, violence, medical...",
          namespaces: "tech, science, general...",
          testFlags: "adult,violence",
          testNamespaces: "*",
        },
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
      
      apiDebug: {
        title: "Debug de APIs Gratuitas",
        subtitle: "Testa conexão e autenticação com cada API",
        testAllApis: "Testar Todas as APIs",
        apiWorking: "API funcionando!",
        tokensUsed: "({count} tokens usados)",
        viewHeaders: "Ver Headers",
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
        noDescription: "Sem descrição",
      },
      
      imagesGallery: {
        toasts: {
          descriptionUpdated: "Descrição atualizada",
          descriptionSuccess: "A descrição da imagem foi atualizada com sucesso",
          updateError: "Erro ao atualizar",
          imagesDeleted: "Imagens deletadas",
          deleteError: "Erro ao deletar",
        },
        placeholders: {
          search: "Buscar por nome, descrição, namespace...",
          allSources: "Todas as fontes",
          allNamespaces: "Todos os namespaces",
          newDescription: "Digite a nova descrição da imagem...",
        },
      },
      
      namespaceDetail: {
        toasts: {
          success: "Namespace atualizado com sucesso",
          error: "Falha ao atualizar namespace",
        },
        loading: "Carregando...",
        notFound: {
          title: "Namespace Não Encontrado",
          description: "O namespace que você procura não existe.",
        },
        buttons: {
          back: "Voltar para Namespaces",
          save: "Salvar Alterações",
          saving: "Salvando...",
        },
        tabs: {
          basic: "Informações Básicas",
          sliders: "Controles de Personalidade",
          prompt: "Prompt do Sistema",
          triggers: "Gatilhos e Prioridade",
        },
        basic: {
          title: "Informações Básicas",
          description: "Configure identidade e descrição do namespace",
          labels: {
            name: "Nome",
            description: "Descrição",
            icon: "Ícone (nome Lucide)",
          },
          placeholders: {
            name: "financas/investimentos",
            description: "Descreva este namespace...",
            icon: "Briefcase",
          },
        },
        sliders: {
          title: "Sobrescrever Controles de Personalidade",
          description: "Personalize traços de personalidade da IA específicos para este namespace",
          enableLabel: "Ativar Controles Personalizados",
          states: {
            enabled: "Ativado",
            disabled: "Desativado",
          },
        },
        prompt: {
          title: "Sobrescrever Prompt do Sistema",
          description: "Adicione instruções específicas do namespace ao prompt do sistema da IA",
          labels: {
            mergeStrategy: "Estratégia de Mesclagem",
            customPrompt: "Prompt Personalizado do Sistema",
          },
          selectOptions: {
            override: "Sobrescrever (Substituir prompt global)",
            merge: "Mesclar (Combinar com prompt global)",
            fallback: "Fallback (Usar se não houver prompt global)",
          },
          placeholders: {
            prompt: "Você é um assistente de IA especializado em...",
          },
        },
        triggers: {
          title: "Gatilhos de Detecção",
          description: "Configure palavras-chave e padrões para ativar automaticamente este namespace",
          labels: {
            priority: "Prioridade (1=Alta, 2=Média, 3=Baixa)",
            confidenceThreshold: "Limite de Confiança",
          },
          placeholders: {
            addTrigger: "Adicionar palavra-chave gatilho...",
          },
          priorityOptions: {
            high: "1 - Prioridade Alta",
            medium: "2 - Prioridade Média",
            low: "3 - Prioridade Baixa",
          },
        },
        fallbacks: {
          noDescription: "Sem descrição",
        },
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
        
        // PHASE 2: Slider Overrides
        sliders: {
          title: "Personalidade Específica",
          subtitle: "Customize os sliders de personalidade para este namespace",
          useGlobalSettings: "Usar Configurações Globais",
          customizeForNamespace: "Customizar para este Namespace",
          persuasiveness: "Persuasão",
          persuasivenessDesc: "Nível de persuasão nas recomendações (0-100%)",
          professionalism: "Profissionalismo",
          professionalismDesc: "Grau de formalidade e seriedade (0-100%)",
          friendliness: "Amigabilidade",
          friendlinessDesc: "Tom caloroso e acolhedor (0-100%)",
          assertiveness: "Assertividade",
          assertivenessDesc: "Confiança e segurança nas respostas (0-100%)",
          creativity: "Criatividade",
          creativityDesc: "Originalidade e inovação (0-100%)",
          formality: "Formalidade",
          formalityDesc: "Nível de linguagem formal (0-100%)",
          empathy: "Empatia",
          empathyDesc: "Compreensão emocional e sensibilidade (0-100%)",
          resetToGlobal: "Resetar para Global",
          globalValue: "Global",
          customValue: "Custom",
        },
        
        // PHASE 2: System Prompt Override
        systemPrompt: {
          title: "System Prompt Customizado",
          subtitle: "Adicione instruções específicas para este namespace",
          globalPrompt: "Prompt Global",
          namespacePrompt: "Prompt do Namespace",
          placeholder: "Instruções adicionais para este namespace...",
          mergeStrategy: "Estratégia de Merge",
          mergeStrategyDesc: "Como combinar prompts global e namespace",
          append: "Anexar",
          prepend: "Prefixar",
          replace: "Substituir",
          appendDesc: "Adiciona ao final do prompt global",
          prependDesc: "Adiciona antes do prompt global",
          replaceDesc: "Substitui completamente o prompt global",
          preview: "Pré-visualização",
          finalPrompt: "Prompt Final",
        },
        
        // PHASE 2: Triggers & Priority
        triggers: {
          title: "Triggers de Detecção",
          subtitle: "Configure gatilhos para ativar este namespace",
          add: "Adicionar Trigger",
          keyword: "Palavra-chave",
          keywordDesc: "Trigger por palavra exata",
          pattern: "Padrão",
          patternDesc: "Trigger por regex pattern",
          semanticMatch: "Match Semântico",
          semanticMatchDesc: "Trigger por similaridade semântica (LLM)",
          examples: "Exemplos",
          examplesPlaceholder: "turismo em Portugal, viagens, YYD, ...",
          priority: "Prioridade",
          priorityDesc: "Ordem de precedência (0-100, maior = mais prioritário)",
          confidence: "Confiança Mínima",
          confidenceDesc: "Threshold de confiança para ativação (0-100%)",
          remove: "Remover",
          noTriggers: "Nenhum trigger configurado",
        },
        
        // PHASE 2: Analytics
        analytics: {
          title: "Analytics do Namespace",
          subtitle: "Métricas de uso e performance",
          usageStats: "Estatísticas de Uso",
          detections: "Detecções",
          detectionsDesc: "Quantas vezes este namespace foi detectado",
          avgConfidence: "Confiança Média",
          avgConfidenceDesc: "Confiança média nas detecções",
          sliderImpact: "Impacto dos Sliders",
          sliderImpactDesc: "Quantas respostas usaram sliders customizados",
          promptOverrides: "Overrides de Prompt",
          promptOverridesDesc: "Quantas respostas usaram prompt customizado",
          performance: "Performance",
          avgLatency: "Latência Média",
          successRate: "Taxa de Sucesso",
          topTriggers: "Top Triggers",
          noData: "Nenhum dado disponível",
          overrides: "Overrides",
          none: "Nenhum",
          priority: "Prioridade",
        },
        
        validation: {
          nameRequired: "Nome obrigatório",
          nameRequiredDesc: "Por favor, insira um nome para o namespace",
          invalidRootFormat: "Formato inválido para namespace raiz",
          rootNoSlash: "Namespace raiz não pode conter '/'",
          parentRequired: "Namespace pai obrigatório",
          selectParentDesc: "Selecione o namespace pai para criar um sub-namespace",
          invalidFormat: "Formato inválido",
          subFormatError: "Sub-namespace deve estar no formato pai/filho",
          sliderOutOfBounds: "Valor do slider inválido",
          sliderOutOfBoundsDesc: "Os valores devem estar entre 0 e 100",
          priorityRequired: "Prioridade obrigatória",
          confidenceOutOfBounds: "Confiança deve estar entre 0 e 100",
        },
        toast: {
          created: "Namespace criado!",
          updated: "Namespace atualizado!",
          deleted: "Namespace removido!",
          contentQueued: "Conteúdo adicionado à fila de curadoria!",
          indexError: "Erro ao indexar conteúdo",
          unknownError: "Erro desconhecido",
          customVersionCreated: "Versão customizada criada!",
          slidersSaved: "Sliders salvos!",
          promptSaved: "Prompt salvo!",
          triggerAdded: "Trigger adicionado!",
          triggerRemoved: "Trigger removido!",
          contentPendingHITL: "O conteúdo aguarda aprovação humana antes de ser indexado na Knowledge Base",
          additionalContentPendingHITL: "O conteúdo adicional aguarda aprovação humana antes de ser indexado na Knowledge Base",
        },
        
        pendingApprovalDesc: "O conteúdo aguarda aprovação humana antes de ser indexado na Knowledge Base",
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
      save: "Save",
      saving: "Saving...",
      cancel: "Cancel",
      delete: "Delete",
      deleting: "Deleting...",
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
      addedSuccess: "Added successfully!",
      removedSuccess: "Removed successfully!",
      approvedSuccess: "Approved successfully!",
      rejectedSuccess: "Rejected",
      approveError: "Error approving",
      rejectError: "Error rejecting",
      selectAtLeastOne: "Select at least one item",
      search: "Search",
      processingFiles: "Processing",
      files: "file(s)",
      processedAndIndexed: "processed and indexed",
      failedToProcess: "Failed to process files",
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
        today24h: "24h (Today)",
        history: "History",
        todayUsageUtc: "Today's Usage (UTC reset)",
        totalHistory: "Total History",
        tokens: "Tokens",
        autoEvolution: "Auto-Evolution",
        conversations: "Conversations",
        highQuality: "High Quality",
        datasetsKb: "KB Datasets",
        jobs: "Jobs",
        autoLearningSystem: "Auto-learning system",
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
          urlWarningWithUrl: "Warning: protocol added automatically - {{url}}",
          webSearchSuccess: "Knowledge added successfully!",
          webSearchWithCountAndQuery: "{{count}} knowledge items from search '{{query}}'",
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
            namespaces: {
              label: "Namespaces (Multi-Agents):",
              help: "Select which agents will have access to this knowledge",
            },
          },
          learnUrl: {
            title: "Learn from a URL",
            description: "AION will access the link and learn all content",
            urlPlaceholder: "https://example.com/article",
            learning: "Learning...",
            learnFromThisUrl: "Learn from this URL",
            learningMode: "Learning Mode:",
            singlePage: "Learn from Page - Complete scan of this page/link only",
            deepCrawl: "Complete Learning - Scan all pages and sublinks",
            downloadMedia: "Also download images and videos (besides text)",
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
          source: "Source:",
          save: "Save",
          cancel: "Cancel",
          confirmDelete: "Remove this knowledge?",
          editTitlePlaceholder: "Knowledge title",
          editContentPlaceholder: "Knowledge content",
          sourceTypes: {
            manual: "manual",
            url: "url",
            websearch: "web search",
            file: "file",
          },
        },
        
        cascade: {
          dialog: {
            title: "Delete Document - Cascade Impact Analysis",
            aboutToDelete: "You are about to delete: {{title}}",
            analyzingImpact: "Analyzing cascade impact...",
            loadError: "Failed to load dependency graph: {{error}}",
            cascadeImpactLabel: "Cascade Impact:",
            willAffectTemplate: "This deletion will affect {{datasets}} datasets and {{models}} models",
            modelsTaintedSuffix: "({{count}} models already tainted)",
            noImpact: "No cascade impact detected. This document is not used by any datasets or models.",
            affectedDatasetsTitle: "Affected Datasets ({{count}})",
            affectedModelsTitle: "Affected Models ({{count}})",
            datasetVersion: "Dataset #{{id}} v{{version}}",
            taintedBadge: "Tainted",
            deletionReasonLabel: "Deletion Reason",
            deletionReasonRequired: "*",
            selectReasonPlaceholder: "Select reason",
            reasonQuality: "Quality Issues",
            reasonDuplicate: "Duplicate Content",
            reasonExpired: "Expired/Outdated",
            reasonRequest: "User Request",
            reasonGdpr: "GDPR Compliance",
            gdprReasonLabel: "GDPR Specific Reason",
            gdprReasonRequired: "*",
            gdprReasonPlaceholder: "E.g., Right to erasure, Data minimization",
            retentionDaysLabel: "Tombstone Retention (days)",
            retentionPlaceholder: "Leave empty for permanent retention",
            retentionHint: "How long to keep the deletion audit trail (empty = forever)",
            deleteButtonLabel: "Delete Document",
          },
          status: {
            active: "Active",
            tainted: "Tainted",
            deleted: "Deleted",
            pending: "Pending",
          },
          toasts: {
            validationErrorTitle: "Validation Error",
            selectReasonError: "Please select a deletion reason",
            gdprReasonRequiredTitle: "GDPR Reason Required",
            gdprReasonRequiredDesc: "Please provide a GDPR-specific reason for deletion",
            deleteSuccessTitle: "Document deleted successfully",
            deleteSuccessDescTemplate: "Deletion complete: {{datasets}} datasets and {{models}} models affected",
          },
        },
        
        states: {
          loading: "Loading...",
          noDocuments: "No knowledge found. Add new knowledge above!",
        },
      },
      
      gpuManagement: {
        title: "GPU Management",
        subtitle: "Manage GPU workers and load balancing",
        
        // Header
        header: {
          title: "GPU Management",
          subtitle: "Centralized control for all GPU workers",
          addGpu: "Add GPU",
        },
        
        // Stats Cards
        stats: {
          totalWorkers: "Total Workers",
          autoManualTemplate: "{auto} auto / {manual} manual",
          online: "Online",
          offlineUnhealthyTemplate: "{offline} offline · {unhealthy} unhealthy",
          totalRequests: "Total Requests",
          avgLatency: "Avg Latency",
          msUnit: "ms",
        },
        
        // Table
        table: {
          title: "GPU Workers",
          headers: {
            id: "ID",
            type: "Type",
            provider: "Provider",
            account: "Account",
            gpu: "GPU",
            status: "Status",
            quota: "Quota",
            requests: "Requests",
            latency: "Latency",
            actions: "Actions",
          },
          na: "N/A",
        },
        
        // Badges
        badges: {
          online: "Online",
          offline: "Offline",
          unhealthy: "Unhealthy",
          pending: "Pending",
          auto: "Auto",
          manual: "Manual",
        },
        
        // Quota
        quota: {
          sessionTemplate: "Session: {used}h / {max}h",
          weekTemplate: "Week: {used}h / {max}h",  // Dynamic max (21h = 70% of 30h)
          hourUnit: "h",
        },
        
        // Empty State
        emptyState: {
          message: "No GPU workers configured",
          addFirstGpu: "Add Your First GPU",
        },
        
        // Dialogs
        dialogs: {
          addWorkerTitle: "Add GPU Worker",
          chooseMethod: "Choose provisioning method:",
          comingSoon: "Coming Soon",
          kaggleDesc: "Kaggle auto-provisioning will be available soon",
          colabDesc: "Colab auto-provisioning will be available soon",
          manualDesc: "Manual GPU addition will be available soon",
          kaggleButton: "Auto-Provision Kaggle",
          colabButton: "Auto-Provision Colab",
          manualButton: "Add Manual Worker",
        },
        
        // NEW: Tabs Navigation
        tabs: {
          overview: "Overview",
          auth: "Authentication",
          quotas: "Quotas",
          timeline: "Timeline",
          workersCount: "Workers ({count})",
        },
        
        // NEW: Auto-Refresh Configuration
        autoRefresh: {
          title: "Auto-Refresh Configuration",
          description: "Automatic quota data refresh frequency",
          interval: "Interval:",
          intervalOptions: {
            tenSeconds: "10 seconds",
            thirtySeconds: "30 seconds",
            oneMinute: "1 minute",
            fiveMinutes: "5 minutes",
          },
          status: {
            stale: "Data stale (>10min)",
            updated: "Data updated",
          },
        },
        
        // NEW: Authentication Section
        auth: {
          title: "Google Authentication (Kaggle + Colab)",
          description: "Configure secure access to GPU platforms via Google OAuth",
          statusTitle: "Authentication Status",
          accountsConnectedCount: "{count} account(s) connected",
          addAccount: "Add Account",
          connectAccount: "Connect Account",
          connectedAccountsTitle: "Connected Accounts:",
          providers: "Providers:",
          valid: "Valid",
          expired: "Expired",
          // Auth status badges
          authenticated: "Authenticated",
          notAuthenticated: "Not Authenticated",
          expiringSoon: "Expiring Soon",
          // QuotaProviderCard keys
          loginRequired: "Login Required",
        },
        
        // NEW: Quotas Section
        quotas: {
          title: "Real-Time GPU Quotas",
          syncButton: "Sync Now",
          syncing: "Syncing...",
          emptyMessage: "No quota available. Connect a Google account to get started.",
          emptyAction: "Connect Google Account",
          // QuotaProviderCard keys
          noData: "No Data",
          staleData: "Stale Data",
          scrapedAt: "Updated",
          kaggle: {
            sessionRemaining: "Session Remaining",
            sessionMax: "Max Session",
            weeklyUsed: "Weekly Used",
            weeklyRemaining: "Weekly Remaining",
            canStart: "Can Start",
            shouldStop: "Should Stop",
          },
          colab: {
            computeUnitsUsed: "Compute Units Used",
            computeUnitsRemaining: "Compute Units Remaining",
            sessionRemaining: "Session Remaining",
            inCooldown: "In Cooldown",
          },
          // Boolean labels
          yes: "Yes",
          no: "No",
        },
        
        // NEW: Usage History Section
        usageHistory: {
          title: "Usage History",
          description: "Quota consumption chart over time",
          noData: "No historical data available",
          timeRanges: {
            oneHour: "1 Hour",
            sixHours: "6 Hours",
            twentyFourHours: "24 Hours",
            sevenDays: "7 Days",
            thirtyDays: "30 Days",
          },
          thresholds: {
            warning: "Warning (70%)",
            critical: "Critical (85%)",
            emergency: "Emergency (95%)",
          },
          providers: {
            kaggle: "Kaggle",
            colab: "Colab",
          },
          aria: {
            timeRangeSelector: "Time range selector",
          },
        },
        
        // NEW: Timeline Section
        timeline: {
          title: "Session Timeline",
          description: "Visualization of active sessions, cooldowns and next available slots",
          emptyMessage: "No sessions available. Connect a Google account to view the timeline.",
          noSessions: "No active sessions",
          remaining: "Remaining",
          cooldown: "Cooldown",
          readyToStart: "Ready to start",
          canStart: "Can start",
          cannotStart: "Cannot start",
          shouldStop: "Should stop",
          okToContinue: "OK to continue",
          status: {
            idle: "Idle",
            active: "Active",
            cooldown: "Cooldown",
            available: "Available",
          },
          labels: {
            placeholder: "-",
          },
        },
        
        // NEW: Quota Alerts
        quotaAlerts: {
          dismiss: "Dismiss alert",
          titleTemplate: "{provider} Quota Alert - {percentage}% Used",
          syncButton: "Sync Now",
          emergencyAction: "⚠️ Immediate action required - reduce workload or risk quota exhaustion",
          criticalWarning: "⚠️ High usage detected - consider reducing workload",
        },
        
        // NEW: Time Templates
        timeTemplates: {
          week: "Week: {used}h / {max}h",
          session: "Session: {used}h / {max}h",
        },
        
        // NEW: Overview Cards (QuotaOverviewCard + GPUWorkersCard)
        overviewCards: {
          quotaCard: {
            title: "GPU Quota Status",
            subtitle: "Monitor real-time GPU usage",
            emptyState: {
              noAccount: "No Google account connected",
              connectHint: "Connect an account to monitor quotas",
              connectButton: "Connect Account",
            },
            alertLevels: {
              normal: "Normal",
              warning: "Warning",
              critical: "Critical",
              emergency: "Emergency",
            },
            stale: "Stale",
            descriptionFull: "Monitor Kaggle and Colab GPU consumption in real-time",
            kaggle: {
              errorTitle: "Kaggle: Error Fetching Quotas",
              errorFallback: "Failed to connect to Kaggle. Try syncing again.",
              noDataTitle: "Kaggle: Data Unavailable",
              noDataDesc: "No quota data available. Run a manual sync.",
              label: "Kaggle",
              modeBadge: "On-Demand + Idle (10min)",
              weeklyTemplate: "Weekly: {used}h / {max}h",
              percentUsed: "% used",
              canStart: "Can start",
              quotaExhausted: "Quota exhausted",
            },
            colab: {
              errorTitle: "Colab: Error Fetching Quotas",
              errorFallback: "Failed to connect to Google Colab. Try syncing again.",
              noDataTitle: "Colab: Data Unavailable",
              noDataDesc: "No quota data available. Run a manual sync.",
              label: "Google Colab",
              modeBadge: "Fixed Schedule (36h cooldown)",
              unitsTemplate: "Units: {used} / {max}",
              percentUsed: "% used",
              canStart: "Can start",
              inCooldown: "In cooldown",
            },
            actions: {
              viewDetails: "View Full Details",
              sync: "Sync",
              syncing: "Syncing...",
            },
          },
          workersCard: {
            title: "GPU Workers",
            loading: "Monitoring GPU workers...",
            manage: "Manage GPU workers",
            emptyState: {
              noWorkers: "No GPU workers registered",
              addHint: "Add a worker to get started",
              addButton: "Add Worker",
            },
            healthLevels: {
              excellent: "Excellent",
              good: "Good",
              degraded: "Degraded",
              critical: "Critical",
            },
            poolDescriptionSingular: "Pool of {count} GPU worker",
            poolDescriptionPlural: "Pool of {count} GPU workers",
            statusLabels: {
              healthy: "Healthy",
              unhealthy: "Unhealthy",
              offline: "Offline",
            },
            metrics: {
              totalRequests: "Total Requests",
              avgLatency: "Avg Latency",
            },
            actions: {
              viewAll: "View All ({count})",
              add: "Add",
            },
          },
        },
        
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
        
        // Google Auth Dialog - EN-US (66 keys)
        googleAuthDialog: {
          dialog: {
            trigger: "Connect Google Account",
            title: "Google Authentication - Kaggle & Colab",
            description: "Configure secure access to GPU platforms with AES-256-GCM encryption",
          },
          tabs: {
            instructions: "1. Instructions",
            kaggle: "2. Kaggle",
            colab: "3. Colab",
          },
          instructions: {
            howItWorks: {
              title: "How it works",
              description: "You'll log in manually ONCE to Google. Then, we'll copy the authentication cookies and save them encrypted. The system will automatically scrape quotas every 10 minutes, without needing to log in again for ~30 days.",
            },
            prerequisites: {
              title: "Prerequisites",
              chrome: "Google Chrome browser (recommended for compatibility)",
              account: "Google account with access to Kaggle and/or Google Colab",
              devtools: "DevTools open (F12) to copy cookies",
            },
            security: {
              title: "Security",
              encryption: "Cookies encrypted with AES-256-GCM using SESSION_SECRET",
              noPlaintext: "No cookies stored in plain text",
              autoValidation: "Automatic validation on every sync (10min)",
              expiration: "Expiration after 30 days (with advance warnings)",
            },
            warning: {
              title: "⚠️ IMPORTANT - BAN Risk",
              kaggle: "<strong>Kaggle:</strong> Max 8.4h/session, 21h/week. Violation = PERMANENT BAN.",
              colab: "<strong>Colab:</strong> Max 8.4h/session, 36h cooldown. Violation = PERMANENT BAN.",
              auto: "The system automatically respects these limits via quota scraping.",
            },
            buttons: {
              kaggle: "Connect Kaggle",
              colab: "Connect Colab",
            },
          },
          kaggle: {
            title: "Step by step - Kaggle",
            step1: "Open www.kaggle.com in new tab",
            step2: "Log in with your Google account",
            step3: "Open DevTools (F12) → Console → Paste the command below",
            step4: "Copy the result and paste in the \"Cookies\" field below",
            cookieCommand: {
              label: "Command to copy cookies (Paste in DevTools Console):",
            },
            email: {
              label: "Google account email",
              placeholder: "your-email@gmail.com",
            },
            cookies: {
              label: "Cookies (Paste the Console result)",
              placeholder: "KAGGLE_KEY=value; KAGGLE_USER_ID=123; ...",
              hint: "Expected format: name1=value1; name2=value2; ...",
            },
            buttons: {
              back: "Back",
              save: "Save Kaggle",
              saving: "Saving...",
            },
          },
          colab: {
            title: "Step by step - Google Colab",
            step1: "Open colab.research.google.com in new tab",
            step2: "Log in with your Google account",
            step3: "Open DevTools (F12) → Console → Paste the command below",
            step4: "Copy the result and paste in the \"Cookies\" field below",
            cookieCommand: {
              label: "Command to copy cookies (Paste in DevTools Console):",
            },
            email: {
              label: "Google account email",
              placeholder: "your-email@gmail.com",
            },
            cookies: {
              label: "Cookies (Paste the Console result)",
              placeholder: "GOOGLE_SESSION=value; GOOGLE_USER=123; ...",
              hint: "Expected format: name1=value1; name2=value2; ...",
            },
            buttons: {
              back: "Back",
              save: "Save Colab",
              saving: "Saving...",
            },
          },
          toasts: {
            saveSuccess: {
              title: "✅ Authentication saved",
              descriptionTemplate: "{{provider}} cookies successfully saved for {{email}}",
            },
            saveError: {
              title: "❌ Error saving authentication",
            },
            copied: {
              title: "✅ Copied!",
              description: "Command copied to clipboard",
            },
          },
          errors: {
            emailRequired: {
              title: "Email required",
              description: "Please enter your Google account email",
            },
            cookiesRequired: {
              title: "Cookies required",
              description: "Please paste the cookies copied from the browser",
            },
            cookiesInvalid: {
              title: "Invalid cookies",
              description: "Could not extract valid cookies from pasted text",
            },
            processingError: {
              title: "Error processing cookies",
              fallback: "Invalid format",
            },
          },
          providers: {
            kaggle: "Kaggle",
            colab: "Colab",
          },
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
      
      editWorkerDialog: {
        titleTemplate: "Edit GPU Worker #{id}",
        description: "Update worker information and settings",
        fields: {
          provider: "Provider",
          accountId: "Account ID",
          model: "Model",
          gpu: "GPU Type",
          status: "Status",
        },
        placeholders: {
          accountId: "Email or username",
          model: "TinyLlama-1.1B-Chat",
          gpu: "Tesla T4",
        },
        statusOptions: {
          healthy: "Healthy",
          unhealthy: "Unhealthy",
          offline: "Offline",
          pending: "Pending",
        },
        infoLabels: {
          requests: "Requests:",
          avgLatency: "Avg Latency:",
          ngrokUrl: "Ngrok URL:",
        },
        buttons: {
          cancel: "Cancel",
          save: "Save Changes",
        },
        toasts: {
          updateSuccess: "Worker updated",
          updateSuccessDesc: "Changes saved successfully",
          updateError: "Error updating",
          updateErrorDesc: "Failed to update worker",
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
        verbosityLevels: "0-20%: very concise | 21-40%: concise | 41-60%: balanced | 61-80%: detailed | 81-100%: very detailed",
        formality: "Formality",
        formalityDesc: "0% = Casual and friendly | 100% = Formal and professional",
        formalityLevels: "0-20%: super casual | 21-40%: casual | 41-60%: semi-formal | 61-80%: formal | 81-100%: very formal",
        creativity: "Creativity",
        creativityDesc: "0% = Only objective facts | 100% = Uses metaphors, analogies and creative language",
        creativityLevels: "0-20%: purely factual | 21-40%: factual/literal | 41-60%: balanced | 61-80%: creative | 81-100%: highly creative",
        precision: "Precision",
        precisionDesc: "0% = Approximate numbers and estimates | 100% = Exact numbers and cited sources",
        precisionLevels: "0-20%: very approximate | 21-40%: approximate | 41-60%: balanced | 61-80%: precise | 81-100%: extremely precise",
        persuasiveness: "Persuasiveness",
        persuasivenessDesc: "0% = Presents neutral facts | 100% = Uses persuasive techniques and strong arguments",
        persuasivenessLevels: "0-20%: purely informative | 21-40%: neutral/informative | 41-60%: moderately persuasive | 61-80%: persuasive | 81-100%: highly persuasive",
        empathy: "Empathy",
        empathyDesc: "0% = Objective and factual | 100% = Shows empathy and emotional consideration",
        empathyLevels: "0-20%: purely objective | 21-40%: objective/factual | 41-60%: balanced empathy | 61-80%: empathetic | 81-100%: highly empathetic",
        enthusiasm: "Enthusiasm",
        enthusiasmDesc: "0% = Calm and reserved tone | 100% = High energy and expressive language!",
        enthusiasmLevels: "0-20%: very calm | 21-40%: calm/reserved | 41-60%: moderately enthusiastic | 61-80%: enthusiastic | 81-100%: very enthusiastic",
        systemPrompt: "System Prompt",
        systemPromptDesc: "Base instructions for AI behavior",
        systemPromptPlaceholder: "Enter system prompt...",
        viewFullPrompt: "View Full Prompt",
        previewModal: {
          title: "Complete System Prompt",
          description: "The 7 behavior sliders automatically generated this system prompt, which defines how AION behaves in ALL responses (using its own GPU or any external API).",
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
        databaseManagement: {
          header: "Database Management",
          description: "Create full database backups and restore from previous backups",
          actions: {
            createBackup: "Create Backup",
            downloadBackup: "Download",
            restoreBackup: "Restore Backup",
            uploadFile: "Upload backup file",
            creating: "Creating backup...",
            restoring: "Restoring...",
          },
          history: {
            title: "Backup History",
            empty: "No backups found",
            columns: {
              date: "Date",
              size: "Size",
              type: "Type",
              status: "Status",
              actions: "Actions",
            },
          },
          restore: {
            confirmTitle: "Confirm Restore",
            confirmMessage: "Are you sure you want to restore this backup?",
            warningMessage: "This action will create a safety snapshot of the current state before restoring. All data will be replaced with the backup content.",
            confirm: "Restore",
            cancel: "Cancel",
          },
          toasts: {
            backupCreated: "Backup created successfully!",
            backupDownloaded: "Backup downloaded successfully!",
            restoreSuccess: "Database restored successfully!",
            restoreError: "Error restoring backup",
            uploadError: "Error uploading backup file",
          },
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
        loading: "Loading...",
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
        
        orphanScan: {
          scanComplete: "Scan complete",
          orphansDetectedTemplate: "{{count}} orphans detected",
          scanError: "Error executing scan",
          buttonTooltip: "Scans the entire platform for orphaned data (without valid references) - diagnostic only, does not delete anything",
          scanning: "Scanning...",
          diagnoseIntegrity: "Diagnose Integrity",
        },
        
        table: {
          icons: "Icons",
          name: "Name",
          slug: "Slug",
          type: "Type",
          namespaces: "Namespaces",
          actions: "Actions",
        },
        
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
          subtitleTemplate: "Update agent {{name}} configuration",
          agentName: "Agent Name",
          slug: "Identifier (Slug)",
          slugAutoGenerated: "Automatically generated by system - not editable",
          description: "Description",
          systemPrompt: "System Prompt",
          rootNamespace: "Root Namespace",
          rootNamespaceHelp: "Agents work in 1 root namespace (e.g., 'finance', 'tech')",
          rootNamespacePlaceholder: "Select 1 root namespace",
          subnamespaces: "Subnamespaces",
          subnamespacesHelp: "SubAgents can have multiple subnamespaces from the same parent namespace",
          subnamespacesPlaceholder: "Select subnamespaces",
          cancel: "Cancel",
          updating: "Updating...",
          saveChanges: "Save Changes",
          subtitle: "Update agent information",
          save: "Save",
          saving: "Saving...",
        },
        
        deleteDialog: {
          title: "Confirm Deletion",
          description: "Are you sure you want to delete this agent? This action cannot be undone. The agent will be permanently removed from the system.",
          cancel: "Cancel",
          delete: "Delete",
        },
        
        orphanDialog: {
          title: "Platform Integrity Diagnosis",
          description: "Orphaned resources detected across all system modules",
          severityHigh: "High Severity",
          severityMedium: "Medium Severity",
          severityLow: "Low Severity",
          orphansTemplate: "{{count}} orphans",
          suggestedAction: "Suggested Action:",
          noOrphans: "No orphans detected",
          allHealthy: "All platform modules are healthy!",
          moduleLabel: "Module",
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
        note: "Note",
        attachments: "Attachments",
        viewAttachment: "View attachment",
        all: "All",
        pages: "Pages",
        images: "Images",
        contentType: "Content Type",
        duplicationStatus: "Duplication Status",
        scanDuplicates: "Scan Duplicates",
        scanImageDuplicates: "Scan Duplicate Images",
        scanning: "Scanning...",
        scanningImages: "Scanning Images...",
        unscanned: "Unscanned",
        unique: "Unique",
        similar: "Similar",
        exactDuplicates: "Exact Duplicates",
        loadingHistory: "Loading history...",
        editItem: "Edit Curation Item",
        rejectItem: "Reject Item",
        approveAndPublish: "Approve and Publish",
        attention: "ATTENTION:",
        content: "Content",
        titleLabel: "Title",
        tags: "Tags",
        tagsPlaceholder: "Tags (comma-separated)",
        namespaces: "Namespaces:",
        aiDescription: "✓ AI Description",
        similarContentDetected: "Similar content detected",
        uniqueContentDetected: "Unique content - no duplicates detected",
        scanDuplicatesComplete: "Duplicate scan complete!",
        scanDuplicatesError: "Error scanning duplicates",
        scanImageDuplicatesComplete: "Duplicate image scan complete!",
        scanImageDuplicatesError: "Error scanning duplicate images",
        itemsAnalyzed: "items analyzed",
        duplicatesDetected: "duplicates detected",
        imagesAnalyzed: "images analyzed",
        absorptionComplete: "Partial absorption complete!",
        absorptionError: "Error absorbing content",
        contentReduced: "Content reduced from",
        reduction: "reduction",
        duplicateOf: "Duplicate of:",
        itemsApprovedSuccess: "items approved successfully!",
        allPendingApprovedAndPublished: "All pending items have been approved and published to KB",
        itemsRejectedSuccess: "items rejected successfully!",
        itemsFailed: "items failed",
        allPendingRemoved: "All pending items have been removed from queue",
        descriptionsGenerated: "Descriptions generated successfully!",
        imagesProcessed: "images processed",
        errorGeneratingDescriptions: "Error generating descriptions",
        selectAll: "Select all",
        selectedCount: "selected",
        approveSelected: "Approve Selected",
        rejectSelected: "Reject Selected",
        approveAllPending: "Approve All Pending",
        rejectAllPending: "Reject All Pending",
        edit: "Edit",
        duplicate: "Duplicate",
        video: "Video",
        image: "Image",
        previewAbsorption: "Preview Absorption",
        previewAbsorptionTooltip: "Intelligent absorption preview - extract only new content",
        playVideo: "Play video",
        viewImage: "View image",
        videos: "Videos",
        unknown: "Unknown",
        characters: "characters",
        generating: "Generating...",
        generateDescriptionsAI: "🤖 Generate AI Descriptions",
        adjustTitleTags: "Adjust title and tags before approving",
        editContentLabel: "Edit Content",
        editContentHelp: "Edit the extracted content if needed before approving",
        imagesAttached: "Attached Images",
        allImagesIndexed: "All images will be indexed along with the content after approval",
        tagsSeparated: "Tags (comma-separated)",
        noteOptional: "Note (optional)",
        observationsPlaceholder: "Observations about this content",
        confirmApproveDesc: "Are you sure you want to approve and publish this content to the Knowledge Base? This action cannot be undone.",
        rejectReasonOptional: "Why is this content being rejected? (optional)",
        rejectMotivo: "Rejection reason",
        publishing: "Publishing...",
        rejecting: "Rejecting...",
        approveItemsCount: "Approve {count} Selected Items",
        confirmBulkApproveDesc: "Are you sure you want to approve and publish {count} items to the Knowledge Base? All will be indexed and made available for training.",
        duplicateExactTitle: "Exact duplicate detected ({percent}% similar)",
        similarContentTitle: "Similar content detected ({percent}% similar)",
        uniqueImageTitle: "Unique image",
        duplicateExactImageTitle: "Exact duplicate ({percent}%)",
        similarImageTitle: "Similar image ({percent}%)",
        cancelar: "Cancel",
        bulkApproveSuccess: "{count} items approved successfully!",
        bulkApproveFailed: "{count} items failed",
        absorptionCompleteTitle: "Partial absorption complete!",
        absorptionCompleteDesc: "Content reduced from {before} to {after} characters ({reduction}% reduction)",
        approveAllWarning: "WARNING: This action will approve and publish ALL {count} pending items to the Knowledge Base. All will be indexed immediately and made available for training when reaching 100 examples. This action cannot be undone.",
        rejectAllWarning: "WARNING: This action will reject and remove ALL {count} pending items from the curation queue. No content will be published to the Knowledge Base or used for training. This action cannot be undone.",
        approveAllTitle: "Approve All {count} Items",
        rejectAllTitle: "Reject All {count} Items",
        noDescription: "No description",
        emptyHistory: "No {filter} items in history (retention: 5 years)",
        approvedStatus: "Approved",
        rejectedStatus: "Rejected",
        reviewedBy: "by {reviewer} on {date} at {time}",
        filterPages: "pages",
        filterImages: "images",
      },
      
      autoApproval: {
        title: "Auto-Approval",
        subtitle: "Configure thresholds and rules for automatic content approval",
        enabled: "Enabled",
        disabled: "Disabled",
        globalSettings: "Global Settings",
        scoreThresholds: "Quality Thresholds",
        contentFiltering: "Content Filtering",
        namespaceControl: "Namespace Control",
        qualityGates: "Quality Gates",
        enableAutoApproval: "Enable Auto-Approval",
        enableAutoReject: "Enable Auto-Reject",
        requireAllQualityGates: "Require All Quality Gates",
        minApprovalScore: "Minimum Approval Score",
        maxRejectScore: "Maximum Rejection Score",
        sensitiveFlags: "Sensitive Flags",
        enabledNamespaces: "Enabled Namespaces",
        reviewRange: "Manual Review Range",
        scoreRange: "Score Range",
        namespaceWildcard: "Namespace Wildcard",
        namespaceWildcardDesc: "Use '*' to allow all namespaces",
        addNamespace: "Add Namespace",
        removeNamespace: "Remove Namespace",
        flagsDescription: "Flags that always require human review (adult, violence, medical, financial, pii)",
        thresholdWarning: "Rejection score must be less than approval score",
        saveChanges: "Save Changes",
        testDecision: "Test Decision",
        testScore: "Test Score",
        testFlags: "Test Flags",
        testNamespaces: "Test Namespaces",
        runTest: "Run Test",
        decisionResult: "Decision Result",
        configUpdated: "Configuration updated successfully",
        configError: "Error updating configuration",
        errorFallback: "Unknown error",
        previewErrorFallback: "Failed to preview decision",
        testDescription: "Test how auto-approval logic would handle specific content",
        tooltips: {
          enabled: "Enable/disable automatic approval globally",
          minApprovalScore: "Content with score >= this value will be approved automatically",
          maxRejectScore: "Content with score < this value will be rejected automatically",
          sensitiveFlags: "Content with these flags always goes to manual review",
          enabledNamespaces: "Namespaces allowed for auto-approval (* = all)",
          autoRejectEnabled: "Allows automatic rejection of low-quality content",
          requireAllQualityGates: "If enabled, content must pass all 5 quality gates",
        },
        placeholders: {
          flags: "adult, violence, medical...",
          namespaces: "tech, science, general...",
          testFlags: "adult,violence",
          testNamespaces: "*",
        },
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
      
      apiDebug: {
        title: "Free API Debug",
        subtitle: "Test connection and authentication with each API",
        testAllApis: "Test All APIs",
        apiWorking: "API working!",
        tokensUsed: "({count} tokens used)",
        viewHeaders: "View Headers",
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
        noDescription: "No description",
      },
      
      imagesGallery: {
        toasts: {
          descriptionUpdated: "Description updated",
          descriptionSuccess: "Image description updated successfully",
          updateError: "Error updating",
          imagesDeleted: "Images deleted",
          deleteError: "Error deleting",
        },
        placeholders: {
          search: "Search by name, description, namespace...",
          allSources: "All sources",
          allNamespaces: "All namespaces",
          newDescription: "Enter new image description...",
        },
      },
      
      namespaceDetail: {
        toasts: {
          success: "Namespace updated successfully",
          error: "Failed to update namespace",
        },
        loading: "Loading...",
        notFound: {
          title: "Namespace Not Found",
          description: "The namespace you're looking for doesn't exist.",
        },
        buttons: {
          back: "Back to Namespaces",
          save: "Save Changes",
          saving: "Saving...",
        },
        tabs: {
          basic: "Basic Info",
          sliders: "Personality Sliders",
          prompt: "System Prompt",
          triggers: "Triggers & Priority",
        },
        basic: {
          title: "Basic Information",
          description: "Configure namespace identity and description",
          labels: {
            name: "Name",
            description: "Description",
            icon: "Icon (Lucide name)",
          },
          placeholders: {
            name: "finance/investments",
            description: "Describe this namespace...",
            icon: "Briefcase",
          },
        },
        sliders: {
          title: "Personality Sliders Override",
          description: "Customize AI personality traits specific to this namespace",
          enableLabel: "Enable Custom Sliders",
          states: {
            enabled: "Enabled",
            disabled: "Disabled",
          },
        },
        prompt: {
          title: "System Prompt Override",
          description: "Add namespace-specific instructions to the AI's system prompt",
          labels: {
            mergeStrategy: "Merge Strategy",
            customPrompt: "Custom System Prompt",
          },
          selectOptions: {
            override: "Override (Replace global prompt)",
            merge: "Merge (Combine with global prompt)",
            fallback: "Fallback (Use if no global prompt)",
          },
          placeholders: {
            prompt: "You are a specialized AI assistant for...",
          },
        },
        triggers: {
          title: "Detection Triggers",
          description: "Configure keywords and patterns to automatically activate this namespace",
          labels: {
            priority: "Priority (1=High, 2=Medium, 3=Low)",
            confidenceThreshold: "Confidence Threshold",
          },
          placeholders: {
            addTrigger: "Add trigger keyword...",
          },
          priorityOptions: {
            high: "1 - High Priority",
            medium: "2 - Medium Priority",
            low: "3 - Low Priority",
          },
        },
        fallbacks: {
          noDescription: "No description",
        },
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
        
        // PHASE 2: Slider Overrides
        sliders: {
          title: "Specific Personality",
          subtitle: "Customize personality sliders for this namespace",
          useGlobalSettings: "Use Global Settings",
          customizeForNamespace: "Customize for this Namespace",
          persuasiveness: "Persuasiveness",
          persuasivenessDesc: "Level of persuasion in recommendations (0-100%)",
          professionalism: "Professionalism",
          professionalismDesc: "Degree of formality and seriousness (0-100%)",
          friendliness: "Friendliness",
          friendlinessDesc: "Warm and welcoming tone (0-100%)",
          assertiveness: "Assertiveness",
          assertivenessDesc: "Confidence and certainty in responses (0-100%)",
          creativity: "Creativity",
          creativityDesc: "Originality and innovation (0-100%)",
          formality: "Formality",
          formalityDesc: "Level of formal language (0-100%)",
          empathy: "Empathy",
          empathyDesc: "Emotional understanding and sensitivity (0-100%)",
          resetToGlobal: "Reset to Global",
          globalValue: "Global",
          customValue: "Custom",
        },
        
        // PHASE 2: System Prompt Override
        systemPrompt: {
          title: "Custom System Prompt",
          subtitle: "Add specific instructions for this namespace",
          globalPrompt: "Global Prompt",
          namespacePrompt: "Namespace Prompt",
          placeholder: "Additional instructions for this namespace...",
          mergeStrategy: "Merge Strategy",
          mergeStrategyDesc: "How to combine global and namespace prompts",
          append: "Append",
          prepend: "Prepend",
          replace: "Replace",
          appendDesc: "Adds to the end of global prompt",
          prependDesc: "Adds before global prompt",
          replaceDesc: "Completely replaces global prompt",
          preview: "Preview",
          finalPrompt: "Final Prompt",
        },
        
        // PHASE 2: Triggers & Priority
        triggers: {
          title: "Detection Triggers",
          subtitle: "Configure triggers to activate this namespace",
          add: "Add Trigger",
          keyword: "Keyword",
          keywordDesc: "Trigger by exact word",
          pattern: "Pattern",
          patternDesc: "Trigger by regex pattern",
          semanticMatch: "Semantic Match",
          semanticMatchDesc: "Trigger by semantic similarity (LLM)",
          examples: "Examples",
          examplesPlaceholder: "tourism in Portugal, travel, YYD, ...",
          priority: "Priority",
          priorityDesc: "Precedence order (0-100, higher = more priority)",
          confidence: "Minimum Confidence",
          confidenceDesc: "Confidence threshold for activation (0-100%)",
          remove: "Remove",
          noTriggers: "No triggers configured",
        },
        
        // PHASE 2: Analytics
        analytics: {
          title: "Namespace Analytics",
          subtitle: "Usage and performance metrics",
          usageStats: "Usage Statistics",
          detections: "Detections",
          detectionsDesc: "How many times this namespace was detected",
          avgConfidence: "Average Confidence",
          avgConfidenceDesc: "Average confidence in detections",
          sliderImpact: "Slider Impact",
          sliderImpactDesc: "How many responses used custom sliders",
          promptOverrides: "Prompt Overrides",
          promptOverridesDesc: "How many responses used custom prompt",
          performance: "Performance",
          avgLatency: "Average Latency",
          successRate: "Success Rate",
          topTriggers: "Top Triggers",
          noData: "No data available",
          overrides: "Overrides",
          none: "None",
          priority: "Priority",
        },
        
        validation: {
          nameRequired: "Name required",
          nameRequiredDesc: "Please enter a namespace name",
          invalidRootFormat: "Invalid format for root namespace",
          rootNoSlash: "Root namespace cannot contain '/'",
          parentRequired: "Parent namespace required",
          selectParentDesc: "Select the parent namespace to create a sub-namespace",
          invalidFormat: "Invalid format",
          subFormatError: "Sub-namespace must be in parent/child format",
          sliderOutOfBounds: "Invalid slider value",
          sliderOutOfBoundsDesc: "Values must be between 0 and 100",
          priorityRequired: "Priority required",
          confidenceOutOfBounds: "Confidence must be between 0 and 100",
        },
        toast: {
          created: "Namespace created!",
          updated: "Namespace updated!",
          deleted: "Namespace removed!",
          contentQueued: "Content added to curation queue!",
          indexError: "Error indexing content",
          unknownError: "Unknown error",
          customVersionCreated: "Custom version created!",
          slidersSaved: "Sliders saved!",
          promptSaved: "Prompt saved!",
          triggerAdded: "Trigger added!",
          triggerRemoved: "Trigger removed!",
          contentPendingHITL: "Content is pending human approval before being indexed into the Knowledge Base",
          additionalContentPendingHITL: "Additional content is pending human approval before being indexed into the Knowledge Base",
        },
        
        pendingApprovalDesc: "Content awaits human approval before being indexed in the Knowledge Base",
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
      save: "Guardar",
      saving: "Guardando...",
      cancel: "Cancelar",
      delete: "Eliminar",
      deleting: "Eliminando...",
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
      addedSuccess: "Agregado exitosamente!",
      removedSuccess: "Eliminado exitosamente!",
      approvedSuccess: "Aprobado exitosamente!",
      rejectedSuccess: "Rechazado",
      approveError: "Error al aprobar",
      rejectError: "Error al rechazar",
      selectAtLeastOne: "Seleccione al menos un elemento",
      search: "Búsqueda",
      processingFiles: "Procesando",
      files: "archivo(s)",
      processedAndIndexed: "procesado(s) e indexado(s)",
      failedToProcess: "Error al procesar archivos",
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
        today24h: "24h (Hoy)",
        history: "Historial",
        todayUsageUtc: "Uso Hoy (reinicio UTC)",
        totalHistory: "Historial Total",
        tokens: "Tokens",
        autoEvolution: "Auto-Evolución",
        conversations: "Conversaciones",
        highQuality: "Alta Calidad",
        datasetsKb: "Datasets KB",
        jobs: "Jobs",
        autoLearningSystem: "Sistema de auto-aprendizaje",
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
          urlWarningWithUrl: "Aviso: protocolo añadido automáticamente - {{url}}",
          webSearchSuccess: "¡Conocimientos añadidos con éxito!",
          webSearchWithCountAndQuery: "{{count}} conocimientos de la búsqueda '{{query}}'",
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
            namespaces: {
              label: "Namespaces (Multi-Agentes):",
              help: "Selecciona qué agentes tendrán acceso a este conocimiento",
            },
          },
          learnUrl: {
            title: "Aprender de una URL",
            description: "AION accederá al enlace y aprenderá todo el contenido",
            urlPlaceholder: "https://example.com/articulo",
            learning: "Aprendiendo...",
            learnFromThisUrl: "Aprender de esta URL",
            learningMode: "Modo de Aprendizaje:",
            singlePage: "Aprender de Página - Escaneo completo solo de esta página/enlace",
            deepCrawl: "Aprendizaje Completo - Escaneo de todas las páginas y subenlaces",
            downloadMedia: "También descargar imágenes y vídeos (además del texto)",
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
          source: "Fuente:",
          save: "Guardar",
          cancel: "Cancelar",
          confirmDelete: "¿Eliminar este conocimiento?",
          editTitlePlaceholder: "Título del conocimiento",
          editContentPlaceholder: "Contenido del conocimiento",
          sourceTypes: {
            manual: "manual",
            url: "enlace",
            websearch: "búsqueda web",
            file: "archivo",
          },
        },
        
        cascade: {
          dialog: {
            title: "Eliminar Documento - Análisis de Impacto en Cascada",
            aboutToDelete: "Estás a punto de eliminar: {{title}}",
            analyzingImpact: "Analizando impacto en cascada...",
            loadError: "Error al cargar grafo de dependencias: {{error}}",
            cascadeImpactLabel: "Impacto en Cascada:",
            willAffectTemplate: "Esta eliminación afectará {{datasets}} datasets y {{models}} modelos",
            modelsTaintedSuffix: "({{count}} modelos ya marcados)",
            noImpact: "No se detectó impacto en cascada. Este documento no es usado por ningún dataset o modelo.",
            affectedDatasetsTitle: "Datasets Afectados ({{count}})",
            affectedModelsTitle: "Modelos Afectados ({{count}})",
            datasetVersion: "Dataset #{{id}} v{{version}}",
            taintedBadge: "Marcado",
            deletionReasonLabel: "Motivo de Eliminación",
            deletionReasonRequired: "*",
            selectReasonPlaceholder: "Seleccionar motivo",
            reasonQuality: "Problemas de Calidad",
            reasonDuplicate: "Contenido Duplicado",
            reasonExpired: "Expirado/Desactualizado",
            reasonRequest: "Solicitud del Usuario",
            reasonGdpr: "Cumplimiento RGPD",
            gdprReasonLabel: "Motivo Específico RGPD",
            gdprReasonRequired: "*",
            gdprReasonPlaceholder: "Ej: Derecho al olvido, Minimización de datos",
            retentionDaysLabel: "Retención del Registro (días)",
            retentionPlaceholder: "Dejar vacío para retención permanente",
            retentionHint: "Cuánto tiempo mantener el registro de auditoría de la eliminación (vacío = para siempre)",
            deleteButtonLabel: "Eliminar Documento",
          },
          status: {
            active: "Activo",
            tainted: "Marcado",
            deleted: "Eliminado",
            pending: "Pendiente",
          },
          toasts: {
            validationErrorTitle: "Error de Validación",
            selectReasonError: "Por favor, selecciona un motivo de eliminación",
            gdprReasonRequiredTitle: "Motivo RGPD Requerido",
            gdprReasonRequiredDesc: "Por favor, proporciona un motivo específico para la eliminación por RGPD",
            deleteSuccessTitle: "Documento eliminado con éxito",
            deleteSuccessDescTemplate: "Eliminación completa: {{datasets}} datasets y {{models}} modelos afectados",
          },
        },
        
        states: {
          loading: "Cargando...",
          noDocuments: "No se encontró conocimiento. ¡Añade nuevo conocimiento arriba!",
        },
      },
      
      gpuManagement: {
        title: "Gestión de GPUs",
        subtitle: "Gestiona workers de GPU y balanceo de carga",
        
        // Header
        header: {
          title: "Gestión de GPUs",
          subtitle: "Control centralizado para todos los GPU workers",
          addGpu: "Agregar GPU",
        },
        
        // Stats Cards
        stats: {
          totalWorkers: "Total de Workers",
          autoManualTemplate: "{auto} auto / {manual} manual",
          online: "En Línea",
          offlineUnhealthyTemplate: "{offline} fuera de línea · {unhealthy} no saludables",
          totalRequests: "Total de Solicitudes",
          avgLatency: "Latencia Media",
          msUnit: "ms",
        },
        
        // Table
        table: {
          title: "GPU Workers",
          headers: {
            id: "ID",
            type: "Tipo",
            provider: "Proveedor",
            account: "Cuenta",
            gpu: "GPU",
            status: "Estado",
            quota: "Cuota",
            requests: "Solicitudes",
            latency: "Latencia",
            actions: "Acciones",
          },
          na: "N/D",
        },
        
        // Badges
        badges: {
          online: "En Línea",
          offline: "Fuera de Línea",
          unhealthy: "No Saludable",
          pending: "Pendiente",
          auto: "Auto",
          manual: "Manual",
        },
        
        // Quota
        quota: {
          sessionTemplate: "Sesión: {used}h / {max}h",
          weekTemplate: "Semana: {used}h / {max}h",  // Dynamic max (21h = 70% of 30h)
          hourUnit: "h",
        },
        
        // Empty State
        emptyState: {
          message: "No hay GPU workers configurados",
          addFirstGpu: "Agregar Tu Primera GPU",
        },
        
        // Dialogs
        dialogs: {
          addWorkerTitle: "Agregar GPU Worker",
          chooseMethod: "Elige el método de aprovisionamiento:",
          comingSoon: "Próximamente",
          kaggleDesc: "Aprovisionamiento automático de Kaggle estará disponible pronto",
          colabDesc: "Aprovisionamiento automático de Colab estará disponible pronto",
          manualDesc: "Adición manual de GPU estará disponible pronto",
          kaggleButton: "Auto-Aprovisionar Kaggle",
          colabButton: "Auto-Aprovisionar Colab",
          manualButton: "Agregar Worker Manual",
        },
        
        // NEW: Tabs Navigation
        tabs: {
          overview: "Visión General",
          auth: "Autenticación",
          quotas: "Cuotas",
          timeline: "Cronología",
          workersCount: "Workers ({count})",
        },
        
        // NEW: Auto-Refresh Configuration
        autoRefresh: {
          title: "Configuración de Auto-Actualización",
          description: "Frecuencia de actualización automática de datos de cuota",
          interval: "Intervalo:",
          intervalOptions: {
            tenSeconds: "10 segundos",
            thirtySeconds: "30 segundos",
            oneMinute: "1 minuto",
            fiveMinutes: "5 minutos",
          },
          status: {
            stale: "Datos desactualizados (>10min)",
            updated: "Datos actualizados",
          },
        },
        
        // NEW: Authentication Section
        auth: {
          title: "Autenticación Google (Kaggle + Colab)",
          description: "Configure acceso seguro a plataformas GPU vía Google OAuth",
          statusTitle: "Estado de Autenticación",
          accountsConnectedCount: "{count} cuenta(s) conectada(s)",
          addAccount: "Agregar Cuenta",
          connectAccount: "Conectar Cuenta",
          connectedAccountsTitle: "Cuentas Conectadas:",
          providers: "Proveedores:",
          valid: "Válido",
          expired: "Expirado",
          // Auth status badges
          authenticated: "Autenticado",
          notAuthenticated: "No Autenticado",
          expiringSoon: "Expirando Pronto",
          // QuotaProviderCard keys
          loginRequired: "Login Requerido",
        },
        
        // NEW: Quotas Section
        quotas: {
          title: "Cuotas GPU en Tiempo Real",
          syncButton: "Sincronizar Ahora",
          syncing: "Sincronizando...",
          emptyMessage: "No hay cuota disponible. Conecta una cuenta de Google para comenzar.",
          emptyAction: "Conectar Cuenta Google",
          // QuotaProviderCard keys
          noData: "Sin Datos",
          staleData: "Datos Desactualizados",
          scrapedAt: "Actualizado",
          kaggle: {
            sessionRemaining: "Sesión Restante",
            sessionMax: "Máx. Sesión",
            weeklyUsed: "Usado Semanal",
            weeklyRemaining: "Restante Semanal",
            canStart: "Puede Iniciar",
            shouldStop: "Debe Detener",
          },
          colab: {
            computeUnitsUsed: "Unidades Usadas",
            computeUnitsRemaining: "Unidades Restantes",
            sessionRemaining: "Sesión Restante",
            inCooldown: "En Espera",
          },
          // Boolean labels
          yes: "Sí",
          no: "No",
        },
        
        // NEW: Usage History Section
        usageHistory: {
          title: "Historial de Uso",
          description: "Gráfico de consumo de cuota a lo largo del tiempo",
          noData: "No hay datos históricos disponibles",
          timeRanges: {
            oneHour: "1 Hora",
            sixHours: "6 Horas",
            twentyFourHours: "24 Horas",
            sevenDays: "7 Días",
            thirtyDays: "30 Días",
          },
          thresholds: {
            warning: "Advertencia (70%)",
            critical: "Crítico (85%)",
            emergency: "Emergencia (95%)",
          },
          providers: {
            kaggle: "Kaggle",
            colab: "Colab",
          },
          aria: {
            timeRangeSelector: "Selector de rango de tiempo",
          },
        },
        
        // NEW: Timeline Section
        timeline: {
          title: "Cronología de Sesiones",
          description: "Visualización de sesiones activas, tiempos de espera y próximas disponibilidades",
          emptyMessage: "No hay sesiones disponibles. Conecta una cuenta de Google para ver la cronología.",
          noSessions: "No hay sesiones activas",
          remaining: "Restante",
          cooldown: "Espera",
          readyToStart: "Listo para iniciar",
          canStart: "Puede iniciar",
          cannotStart: "No puede iniciar",
          shouldStop: "Debe detener",
          okToContinue: "OK para continuar",
          status: {
            idle: "Inactivo",
            active: "Activo",
            cooldown: "En Espera",
            available: "Disponible",
          },
          labels: {
            placeholder: "-",
          },
        },
        
        // NEW: Quota Alerts
        quotaAlerts: {
          dismiss: "Descartar alerta",
          titleTemplate: "{provider} Alerta de Cuota - {percentage}% Usado",
          syncButton: "Sincronizar Ahora",
          emergencyAction: "⚠️ Acción inmediata requerida - reduzca la carga de trabajo o arriesgue agotamiento de cuota",
          criticalWarning: "⚠️ Uso elevado detectado - considere reducir la carga de trabajo",
        },
        
        // NEW: Time Templates
        timeTemplates: {
          week: "Semana: {used}h / {max}h",
          session: "Sesión: {used}h / {max}h",
        },
        
        // NEW: Overview Cards (QuotaOverviewCard + GPUWorkersCard)
        overviewCards: {
          quotaCard: {
            title: "Estado de Cuotas GPU",
            subtitle: "Monitorea el uso de GPU en tiempo real",
            emptyState: {
              noAccount: "No hay cuenta de Google conectada",
              connectHint: "Conecta una cuenta para monitorear cuotas",
              connectButton: "Conectar Cuenta",
            },
            alertLevels: {
              normal: "Normal",
              warning: "Advertencia",
              critical: "Crítico",
              emergency: "Emergencia",
            },
            stale: "Desactualizado",
            descriptionFull: "Monitorea el consumo de GPU de Kaggle y Colab en tiempo real",
            kaggle: {
              errorTitle: "Kaggle: Error al Obtener Cuotas",
              errorFallback: "Error al conectar con Kaggle. Intenta sincronizar nuevamente.",
              noDataTitle: "Kaggle: Datos No Disponibles",
              noDataDesc: "No hay datos de cuota disponibles. Ejecuta una sincronización manual.",
              label: "Kaggle",
              modeBadge: "On-Demand + Idle (10min)",
              weeklyTemplate: "Semanal: {used}h / {max}h",
              percentUsed: "% usado",
              canStart: "Puede iniciar",
              quotaExhausted: "Cuota agotada",
            },
            colab: {
              errorTitle: "Colab: Error al Obtener Cuotas",
              errorFallback: "Error al conectar con Google Colab. Intenta sincronizar nuevamente.",
              noDataTitle: "Colab: Datos No Disponibles",
              noDataDesc: "No hay datos de cuota disponibles. Ejecuta una sincronización manual.",
              label: "Google Colab",
              modeBadge: "Horario Fijo (36h espera)",
              unitsTemplate: "Unidades: {used} / {max}",
              percentUsed: "% usado",
              canStart: "Puede iniciar",
              inCooldown: "En espera",
            },
            actions: {
              viewDetails: "Ver Detalles Completos",
              sync: "Sincronizar",
              syncing: "Sincronizando...",
            },
          },
          workersCard: {
            title: "GPU Workers",
            loading: "Monitoreando workers de GPU...",
            manage: "Gestiona workers de GPU",
            emptyState: {
              noWorkers: "No hay worker GPU registrado",
              addHint: "Agrega un worker para comenzar",
              addButton: "Agregar Worker",
            },
            healthLevels: {
              excellent: "Excelente",
              good: "Bueno",
              degraded: "Degradado",
              critical: "Crítico",
            },
            poolDescriptionSingular: "Pool de {count} worker GPU",
            poolDescriptionPlural: "Pool de {count} workers GPU",
            statusLabels: {
              healthy: "Saludable",
              unhealthy: "No Saludable",
              offline: "Fuera de Línea",
            },
            metrics: {
              totalRequests: "Total de Solicitudes",
              avgLatency: "Latencia Media",
            },
            actions: {
              viewAll: "Ver Todos ({count})",
              add: "Agregar",
            },
          },
        },
        
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
        
        // Google Auth Dialog - ES-ES (66 keys)
        googleAuthDialog: {
          dialog: {
            trigger: "Conectar Cuenta Google",
            title: "Autenticación Google - Kaggle & Colab",
            description: "Configure acceso seguro a plataformas de GPU con cifrado AES-256-GCM",
          },
          tabs: {
            instructions: "1. Instrucciones",
            kaggle: "2. Kaggle",
            colab: "3. Colab",
          },
          instructions: {
            howItWorks: {
              title: "Cómo funciona",
              description: "Iniciarás sesión manualmente UNA VEZ en Google. Luego, copiaremos las cookies de autenticación y las guardaremos cifradas. El sistema hará scraping automático de las cuotas cada 10 minutos, sin necesidad de iniciar sesión nuevamente por ~30 días.",
            },
            prerequisites: {
              title: "Prerrequisitos",
              chrome: "Navegador Google Chrome (recomendado para compatibilidad)",
              account: "Cuenta Google con acceso a Kaggle y/o Google Colab",
              devtools: "DevTools abierto (F12) para copiar cookies",
            },
            security: {
              title: "Seguridad",
              encryption: "Cookies cifradas con AES-256-GCM usando SESSION_SECRET",
              noPlaintext: "Ninguna cookie almacenada en texto plano",
              autoValidation: "Validación automática en cada sync (10min)",
              expiration: "Expiración después de 30 días (con avisos anticipados)",
            },
            warning: {
              title: "⚠️ IMPORTANTE - Riesgo de BAN",
              kaggle: "<strong>Kaggle:</strong> Máx 8.4h/sesión, 21h/semana. Violación = BAN PERMANENTE.",
              colab: "<strong>Colab:</strong> Máx 8.4h/sesión, 36h cooldown. Violación = BAN PERMANENTE.",
              auto: "El sistema respeta automáticamente estos límites vía scraping de cuotas.",
            },
            buttons: {
              kaggle: "Conectar Kaggle",
              colab: "Conectar Colab",
            },
          },
          kaggle: {
            title: "Paso a paso - Kaggle",
            step1: "Abre www.kaggle.com en nueva pestaña",
            step2: "Inicia sesión con tu cuenta Google",
            step3: "Abre DevTools (F12) → Consola → Pega el comando abajo",
            step4: "Copia el resultado y pega en el campo \"Cookies\" abajo",
            cookieCommand: {
              label: "Comando para copiar cookies (Pega en Consola DevTools):",
            },
            email: {
              label: "Email de cuenta Google",
              placeholder: "tu-email@gmail.com",
            },
            cookies: {
              label: "Cookies (Pega el resultado de la Consola)",
              placeholder: "KAGGLE_KEY=value; KAGGLE_USER_ID=123; ...",
              hint: "Formato esperado: name1=value1; name2=value2; ...",
            },
            buttons: {
              back: "Volver",
              save: "Guardar Kaggle",
              saving: "Guardando...",
            },
          },
          colab: {
            title: "Paso a paso - Google Colab",
            step1: "Abre colab.research.google.com en nueva pestaña",
            step2: "Inicia sesión con tu cuenta Google",
            step3: "Abre DevTools (F12) → Consola → Pega el comando abajo",
            step4: "Copia el resultado y pega en el campo \"Cookies\" abajo",
            cookieCommand: {
              label: "Comando para copiar cookies (Pega en Consola DevTools):",
            },
            email: {
              label: "Email de cuenta Google",
              placeholder: "tu-email@gmail.com",
            },
            cookies: {
              label: "Cookies (Pega el resultado de la Consola)",
              placeholder: "GOOGLE_SESSION=value; GOOGLE_USER=123; ...",
              hint: "Formato esperado: name1=value1; name2=value2; ...",
            },
            buttons: {
              back: "Volver",
              save: "Guardar Colab",
              saving: "Guardando...",
            },
          },
          toasts: {
            saveSuccess: {
              title: "✅ Autenticación guardada",
              descriptionTemplate: "Cookies de {{provider}} guardadas exitosamente para {{email}}",
            },
            saveError: {
              title: "❌ Error al guardar autenticación",
            },
            copied: {
              title: "✅ Copiado!",
              description: "Comando copiado al portapapeles",
            },
          },
          errors: {
            emailRequired: {
              title: "Email obligatorio",
              description: "Por favor ingresa el email de tu cuenta Google",
            },
            cookiesRequired: {
              title: "Cookies obligatorias",
              description: "Por favor pega las cookies copiadas del navegador",
            },
            cookiesInvalid: {
              title: "Cookies inválidas",
              description: "No se pudieron extraer cookies válidas del texto pegado",
            },
            processingError: {
              title: "Error al procesar cookies",
              fallback: "Formato inválido",
            },
          },
          providers: {
            kaggle: "Kaggle",
            colab: "Colab",
          },
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
      
      editWorkerDialog: {
        titleTemplate: "Editar GPU Worker #{id}",
        description: "Actualizar información y configuración del worker",
        fields: {
          provider: "Provider",
          accountId: "Account ID",
          model: "Model",
          gpu: "GPU Type",
          status: "Estado",
        },
        placeholders: {
          accountId: "Email o nombre de usuario",
          model: "TinyLlama-1.1B-Chat",
          gpu: "Tesla T4",
        },
        statusOptions: {
          healthy: "Healthy",
          unhealthy: "Unhealthy",
          offline: "Offline",
          pending: "Pending",
        },
        infoLabels: {
          requests: "Requests:",
          avgLatency: "Avg Latency:",
          ngrokUrl: "Ngrok URL:",
        },
        buttons: {
          cancel: "Cancelar",
          save: "Guardar Cambios",
        },
        toasts: {
          updateSuccess: "Worker actualizado",
          updateSuccessDesc: "Los cambios se guardaron correctamente",
          updateError: "Error al actualizar",
          updateErrorDesc: "No se pudo actualizar el worker",
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
        verbosityLevels: "0-20%: muy conciso | 21-40%: conciso | 41-60%: balanceado | 61-80%: detallado | 81-100%: muy detallado",
        formality: "Formalidad",
        formalityDesc: "0% = Casual y amigable | 100% = Formal y profesional",
        formalityLevels: "0-20%: super casual | 21-40%: casual | 41-60%: semi-formal | 61-80%: formal | 81-100%: muy formal",
        creativity: "Creatividad",
        creativityDesc: "0% = Solo hechos objetivos | 100% = Usa metáforas, analogías y lenguaje creativo",
        creativityLevels: "0-20%: puramente factual | 21-40%: factual/literal | 41-60%: balanceado | 61-80%: creativo | 81-100%: altamente creativo",
        precision: "Precisión",
        precisionDesc: "0% = Números aproximados y estimaciones | 100% = Números exactos y fuentes citadas",
        precisionLevels: "0-20%: muy aproximado | 21-40%: aproximado | 41-60%: balanceado | 61-80%: preciso | 81-100%: extremadamente preciso",
        persuasiveness: "Persuasión",
        persuasivenessDesc: "0% = Presenta hechos neutrales | 100% = Usa técnicas persuasivas y argumentos fuertes",
        persuasivenessLevels: "0-20%: puramente informativo | 21-40%: neutral/informativo | 41-60%: moderadamente persuasivo | 61-80%: persuasivo | 81-100%: altamente persuasivo",
        empathy: "Empatía",
        empathyDesc: "0% = Objetivo y factual | 100% = Muestra empatía y consideración emocional",
        empathyLevels: "0-20%: puramente objetivo | 21-40%: objetivo/factual | 41-60%: empatía balanceada | 61-80%: empático | 81-100%: altamente empático",
        enthusiasm: "Entusiasmo",
        enthusiasmDesc: "0% = Tono calmado y reservado | 100% = Alta energía y lenguaje expresivo!",
        enthusiasmLevels: "0-20%: muy calmado | 21-40%: calmado/reservado | 41-60%: moderadamente entusiasmado | 61-80%: entusiasmado | 81-100%: muy entusiasmado",
        systemPrompt: "System Prompt",
        systemPromptDesc: "Instrucciones base para el comportamiento de la IA",
        systemPromptPlaceholder: "Introduce el system prompt...",
        viewFullPrompt: "Ver Prompt Completo",
        previewModal: {
          title: "System Prompt Completo",
          description: "Los 7 deslizadores de comportamiento generaron automáticamente este system prompt, que define cómo AION se comporta en TODAS sus respuestas (usando GPU propio o cualquier API externa).",
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
        databaseManagement: {
          header: "Gestión de Base de Datos",
          description: "Crea copias de seguridad completas de la base de datos y restaura desde copias anteriores",
          actions: {
            createBackup: "Crear Copia",
            downloadBackup: "Descargar",
            restoreBackup: "Restaurar Copia",
            uploadFile: "Subir archivo de copia",
            creating: "Creando copia...",
            restoring: "Restaurando...",
          },
          history: {
            title: "Historial de Copias",
            empty: "No se encontraron copias",
            columns: {
              date: "Fecha",
              size: "Tamaño",
              type: "Tipo",
              status: "Estado",
              actions: "Acciones",
            },
          },
          restore: {
            confirmTitle: "Confirmar Restauración",
            confirmMessage: "¿Estás seguro de que deseas restaurar esta copia?",
            warningMessage: "Esta acción creará una instantánea de seguridad del estado actual antes de restaurar. Todos los datos serán reemplazados con el contenido de la copia.",
            confirm: "Restaurar",
            cancel: "Cancelar",
          },
          toasts: {
            backupCreated: "¡Copia creada con éxito!",
            backupDownloaded: "¡Copia descargada con éxito!",
            restoreSuccess: "¡Base de datos restaurada con éxito!",
            restoreError: "Error al restaurar copia",
            uploadError: "Error al subir archivo de copia",
          },
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
        loading: "Cargando...",
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
        
        orphanScan: {
          scanComplete: "Escaneo completo",
          orphansDetectedTemplate: "{{count}} huérfanos detectados",
          scanError: "Error al ejecutar escaneo",
          buttonTooltip: "Escanea toda la plataforma en busca de datos huérfanos (sin referencias válidas) - solo diagnóstico, no elimina nada",
          scanning: "Escaneando...",
          diagnoseIntegrity: "Diagnosticar Integridad",
        },
        
        table: {
          icons: "Íconos",
          name: "Nombre",
          slug: "Slug",
          type: "Tipo",
          namespaces: "Namespaces",
          actions: "Acciones",
        },
        
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
          subtitleTemplate: "Actualiza la configuración del agente {{name}}",
          agentName: "Nombre del Agente",
          slug: "Identificador (Slug)",
          slugAutoGenerated: "Generado automáticamente por el sistema - no editable",
          description: "Descripción",
          systemPrompt: "System Prompt",
          rootNamespace: "Namespace Raíz",
          rootNamespaceHelp: "Los agentes trabajan en 1 namespace raíz (ej: 'finanzas', 'tech')",
          rootNamespacePlaceholder: "Seleccione 1 namespace raíz",
          subnamespaces: "Subnamespaces",
          subnamespacesHelp: "Los SubAgentes pueden tener múltiples subnamespaces del mismo namespace padre",
          subnamespacesPlaceholder: "Seleccione subnamespaces",
          cancel: "Cancelar",
          updating: "Actualizando...",
          saveChanges: "Guardar Cambios",
          subtitle: "Actualiza la información del agente",
          save: "Guardar",
          saving: "Guardando...",
        },
        
        deleteDialog: {
          title: "Confirmar Eliminación",
          description: "¿Está seguro de que desea eliminar este agente? Esta acción no se puede deshacer. El agente se eliminará permanentemente del sistema.",
          cancel: "Cancelar",
          delete: "Eliminar",
        },
        
        orphanDialog: {
          title: "Diagnóstico de Integridad de la Plataforma",
          description: "Recursos huérfanos detectados en todos los módulos del sistema",
          severityHigh: "Severidad Alta",
          severityMedium: "Severidad Media",
          severityLow: "Severidad Baja",
          orphansTemplate: "{{count}} huérfanos",
          suggestedAction: "Acción Sugerida:",
          noOrphans: "No se detectaron huérfanos",
          allHealthy: "¡Todos los módulos de la plataforma están sanos!",
          moduleLabel: "Módulo",
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
        note: "Nota",
        attachments: "Adjuntos",
        viewAttachment: "Ver adjunto",
        all: "Todos",
        pages: "Páginas",
        images: "Imágenes",
        contentType: "Tipo de Contenido",
        duplicationStatus: "Estado de Duplicación",
        scanDuplicates: "Escanear Duplicados",
        scanImageDuplicates: "Escanear Imágenes Duplicadas",
        scanning: "Escaneando...",
        scanningImages: "Escaneando Imágenes...",
        unscanned: "No Escaneados",
        unique: "Únicos",
        similar: "Similares",
        exactDuplicates: "Duplicados Exactos",
        loadingHistory: "Cargando historial...",
        editItem: "Editar Item de Curaduría",
        rejectItem: "Rechazar Item",
        approveAndPublish: "Aprobar y Publicar",
        attention: "ATENCIÓN:",
        content: "Contenido",
        titleLabel: "Título",
        tags: "Tags",
        tagsPlaceholder: "Tags (separados por coma)",
        namespaces: "Namespaces:",
        aiDescription: "✓ Descripción IA",
        similarContentDetected: "Contenido similar detectado",
        uniqueContentDetected: "Contenido único - sin duplicados detectados",
        scanDuplicatesComplete: "¡Escaneo de duplicados completo!",
        scanDuplicatesError: "Error al escanear duplicados",
        scanImageDuplicatesComplete: "¡Escaneo de imágenes duplicadas completo!",
        scanImageDuplicatesError: "Error al escanear imágenes duplicadas",
        itemsAnalyzed: "items analizados",
        duplicatesDetected: "duplicados detectados",
        imagesAnalyzed: "imágenes analizadas",
        absorptionComplete: "¡Absorción parcial completa!",
        absorptionError: "Error al absorber contenido",
        contentReduced: "Contenido reducido de",
        reduction: "de reducción",
        duplicateOf: "Duplicado de:",
        itemsApprovedSuccess: "items aprobados con éxito!",
        allPendingApprovedAndPublished: "Todos los items pendientes han sido aprobados y publicados en KB",
        itemsRejectedSuccess: "items rechazados con éxito!",
        itemsFailed: "items fallaron",
        allPendingRemoved: "Todos los items pendientes han sido removidos de la cola",
        descriptionsGenerated: "¡Descripciones generadas con éxito!",
        imagesProcessed: "imágenes procesadas",
        errorGeneratingDescriptions: "Error al generar descripciones",
        selectAll: "Seleccionar todos",
        selectedCount: "seleccionados",
        approveSelected: "Aprobar Seleccionadas",
        rejectSelected: "Rechazar Seleccionadas",
        approveAllPending: "Aprobar Todas Pendientes",
        rejectAllPending: "Rechazar Todas Pendientes",
        edit: "Editar",
        duplicate: "Duplicado",
        video: "Vídeo",
        image: "Imagen",
        previewAbsorption: "Vista Previa Absorción",
        previewAbsorptionTooltip: "Vista previa de absorción inteligente - extraer solo contenido nuevo",
        playVideo: "Reproducir vídeo",
        viewImage: "Ver imagen",
        videos: "Vídeos",
        unknown: "Desconocido",
        characters: "caracteres",
        generating: "Generando...",
        generateDescriptionsAI: "🤖 Generar Descripciones IA",
        adjustTitleTags: "Ajuste título y tags antes de aprobar",
        editContentLabel: "Editar Contenido",
        editContentHelp: "Edite el contenido extraído si es necesario antes de aprobar",
        imagesAttached: "Imágenes Adjuntas",
        allImagesIndexed: "Todas las imágenes serán indexadas junto con el contenido después de la aprobación",
        tagsSeparated: "Tags (separados por coma)",
        noteOptional: "Nota (opcional)",
        observationsPlaceholder: "Observaciones sobre este contenido",
        confirmApproveDesc: "¿Está seguro de que desea aprobar y publicar este contenido en la Base de Conocimientos? Esta acción no se puede deshacer.",
        rejectReasonOptional: "¿Por qué se está rechazando este contenido? (opcional)",
        rejectMotivo: "Motivo del rechazo",
        publishing: "Publicando...",
        rejecting: "Rechazando...",
        approveItemsCount: "Aprobar {count} Items Seleccionados",
        confirmBulkApproveDesc: "¿Está seguro de que desea aprobar y publicar {count} items en la Base de Conocimientos? Todos serán indexados y estarán disponibles para entrenamiento.",
        duplicateExactTitle: "Duplicado exacto detectado ({percent}% similar)",
        similarContentTitle: "Contenido similar detectado ({percent}% similar)",
        uniqueImageTitle: "Imagen única",
        duplicateExactImageTitle: "Duplicado exacto ({percent}%)",
        similarImageTitle: "Imagen similar ({percent}%)",
        cancelar: "Cancelar",
        bulkApproveSuccess: "¡{count} items aprobados con éxito!",
        bulkApproveFailed: "{count} items fallaron",
        absorptionCompleteTitle: "¡Absorción parcial completada!",
        absorptionCompleteDesc: "Contenido reducido de {before} a {after} caracteres ({reduction}% de reducción)",
        approveAllWarning: "ADVERTENCIA: Esta acción aprobará y publicará TODOS los {count} items pendientes en la Base de Conocimientos. Todos serán indexados inmediatamente y estarán disponibles para entrenamiento al alcanzar 100 ejemplos. Esta acción no se puede deshacer.",
        rejectAllWarning: "ADVERTENCIA: Esta acción rechazará y eliminará TODOS los {count} items pendientes de la cola de curación. Ningún contenido será publicado en la Base de Conocimientos o usado para entrenamiento. Esta acción no se puede deshacer.",
        approveAllTitle: "Aprobar Todos los {count} Items",
        rejectAllTitle: "Rechazar Todos los {count} Items",
        noDescription: "Sin descripción",
        emptyHistory: "Ningún item {filter} en el historial (retención: 5 años)",
        approvedStatus: "Aprobado",
        rejectedStatus: "Rechazado",
        reviewedBy: "por {reviewer} el {date} a las {time}",
        filterPages: "páginas",
        filterImages: "imágenes",
      },
      
      autoApproval: {
        title: "Auto-Aprobación",
        subtitle: "Configura umbrales y reglas para aprobación automática de contenido",
        enabled: "Activado",
        disabled: "Desactivado",
        globalSettings: "Configuración Global",
        scoreThresholds: "Umbrales de Calidad",
        contentFiltering: "Filtrado de Contenido",
        namespaceControl: "Control de Namespaces",
        qualityGates: "Quality Gates",
        enableAutoApproval: "Habilitar Auto-Aprobación",
        enableAutoReject: "Habilitar Auto-Rechazo",
        requireAllQualityGates: "Requerir Todos los Quality Gates",
        minApprovalScore: "Puntuación Mínima para Aprobación",
        maxRejectScore: "Puntuación Máxima para Rechazo",
        sensitiveFlags: "Flags Sensibles",
        enabledNamespaces: "Namespaces Habilitados",
        reviewRange: "Rango de Revisión Manual",
        scoreRange: "Rango de Puntuación",
        namespaceWildcard: "Comodín de Namespace",
        namespaceWildcardDesc: "Usa '*' para permitir todos los namespaces",
        addNamespace: "Agregar Namespace",
        removeNamespace: "Eliminar Namespace",
        flagsDescription: "Flags que siempre requieren revisión humana (adult, violence, medical, financial, pii)",
        thresholdWarning: "La puntuación de rechazo debe ser menor que la de aprobación",
        saveChanges: "Guardar Cambios",
        testDecision: "Probar Decisión",
        testScore: "Puntuación de Prueba",
        testFlags: "Flags de Prueba",
        testNamespaces: "Namespaces de Prueba",
        runTest: "Ejecutar Prueba",
        decisionResult: "Resultado de la Decisión",
        configUpdated: "Configuración actualizada con éxito",
        configError: "Error al actualizar configuración",
        errorFallback: "Error desconocido",
        previewErrorFallback: "Falló al previsualizar decisión",
        testDescription: "Prueba cómo la lógica de auto-aprobación manejaría contenido específico",
        tooltips: {
          enabled: "Habilita/deshabilita aprobación automática globalmente",
          minApprovalScore: "El contenido con puntuación >= este valor será aprobado automáticamente",
          maxRejectScore: "El contenido con puntuación < este valor será rechazado automáticamente",
          sensitiveFlags: "El contenido con estos flags siempre va a revisión manual",
          enabledNamespaces: "Namespaces permitidos para auto-aprobación (* = todos)",
          autoRejectEnabled: "Permite rechazo automático de contenido de baja calidad",
          requireAllQualityGates: "Si está activado, el contenido debe pasar todos los 5 quality gates",
        },
        placeholders: {
          flags: "adult, violence, medical...",
          namespaces: "tech, science, general...",
          testFlags: "adult,violence",
          testNamespaces: "*",
        },
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
      
      apiDebug: {
        title: "Debug de APIs Gratuitas",
        subtitle: "Prueba conexión y autenticación con cada API",
        testAllApis: "Probar Todas las APIs",
        apiWorking: "¡API funcionando!",
        tokensUsed: "({count} tokens usados)",
        viewHeaders: "Ver Headers",
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
        noDescription: "Sin descripción",
      },
      
      imagesGallery: {
        toasts: {
          descriptionUpdated: "Descripción actualizada",
          descriptionSuccess: "La descripción de la imagen se actualizó con éxito",
          updateError: "Error al actualizar",
          imagesDeleted: "Imágenes eliminadas",
          deleteError: "Error al eliminar",
        },
        placeholders: {
          search: "Buscar por nombre, descripción, namespace...",
          allSources: "Todas las fuentes",
          allNamespaces: "Todos los namespaces",
          newDescription: "Ingrese la nueva descripción de la imagen...",
        },
      },
      
      namespaceDetail: {
        toasts: {
          success: "Namespace actualizado con éxito",
          error: "Error al actualizar namespace",
        },
        loading: "Cargando...",
        notFound: {
          title: "Namespace No Encontrado",
          description: "El namespace que buscas no existe.",
        },
        buttons: {
          back: "Volver a Namespaces",
          save: "Guardar Cambios",
          saving: "Guardando...",
        },
        tabs: {
          basic: "Información Básica",
          sliders: "Controles de Personalidad",
          prompt: "Prompt del Sistema",
          triggers: "Disparadores y Prioridad",
        },
        basic: {
          title: "Información Básica",
          description: "Configure identidad y descripción del namespace",
          labels: {
            name: "Nombre",
            description: "Descripción",
            icon: "Icono (nombre Lucide)",
          },
          placeholders: {
            name: "finanzas/inversiones",
            description: "Describe este namespace...",
            icon: "Briefcase",
          },
        },
        sliders: {
          title: "Sobrescribir Controles de Personalidad",
          description: "Personalice rasgos de personalidad de la IA específicos para este namespace",
          enableLabel: "Activar Controles Personalizados",
          states: {
            enabled: "Activado",
            disabled: "Desactivado",
          },
        },
        prompt: {
          title: "Sobrescribir Prompt del Sistema",
          description: "Agregue instrucciones específicas del namespace al prompt del sistema de la IA",
          labels: {
            mergeStrategy: "Estrategia de Fusión",
            customPrompt: "Prompt Personalizado del Sistema",
          },
          selectOptions: {
            override: "Sobrescribir (Reemplazar prompt global)",
            merge: "Fusionar (Combinar con prompt global)",
            fallback: "Fallback (Usar si no hay prompt global)",
          },
          placeholders: {
            prompt: "Eres un asistente de IA especializado en...",
          },
        },
        triggers: {
          title: "Disparadores de Detección",
          description: "Configure palabras clave y patrones para activar automáticamente este namespace",
          labels: {
            priority: "Prioridad (1=Alta, 2=Media, 3=Baja)",
            confidenceThreshold: "Umbral de Confianza",
          },
          placeholders: {
            addTrigger: "Agregar palabra clave disparadora...",
          },
          priorityOptions: {
            high: "1 - Prioridad Alta",
            medium: "2 - Prioridad Media",
            low: "3 - Prioridad Baja",
          },
        },
        fallbacks: {
          noDescription: "Sin descripción",
        },
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
        
        // PHASE 2: Slider Overrides
        sliders: {
          title: "Personalidad Específica",
          subtitle: "Personaliza los sliders de personalidad para este namespace",
          useGlobalSettings: "Usar Configuración Global",
          customizeForNamespace: "Personalizar para este Namespace",
          persuasiveness: "Persuasión",
          persuasivenessDesc: "Nivel de persuasión en recomendaciones (0-100%)",
          professionalism: "Profesionalismo",
          professionalismDesc: "Grado de formalidad y seriedad (0-100%)",
          friendliness: "Amigabilidad",
          friendlinessDesc: "Tono cálido y acogedor (0-100%)",
          assertiveness: "Asertividad",
          assertivenessDesc: "Confianza y seguridad en respuestas (0-100%)",
          creativity: "Creatividad",
          creativityDesc: "Originalidad e innovación (0-100%)",
          formality: "Formalidad",
          formalityDesc: "Nivel de lenguaje formal (0-100%)",
          empathy: "Empatía",
          empathyDesc: "Comprensión emocional y sensibilidad (0-100%)",
          resetToGlobal: "Resetear a Global",
          globalValue: "Global",
          customValue: "Personalizado",
        },
        
        // PHASE 2: System Prompt Override
        systemPrompt: {
          title: "System Prompt Personalizado",
          subtitle: "Agrega instrucciones específicas para este namespace",
          globalPrompt: "Prompt Global",
          namespacePrompt: "Prompt del Namespace",
          placeholder: "Instrucciones adicionales para este namespace...",
          mergeStrategy: "Estrategia de Fusión",
          mergeStrategyDesc: "Cómo combinar prompts global y namespace",
          append: "Anexar",
          prepend: "Prefijo",
          replace: "Reemplazar",
          appendDesc: "Agrega al final del prompt global",
          prependDesc: "Agrega antes del prompt global",
          replaceDesc: "Reemplaza completamente el prompt global",
          preview: "Vista Previa",
          finalPrompt: "Prompt Final",
        },
        
        // PHASE 2: Triggers & Priority
        triggers: {
          title: "Triggers de Detección",
          subtitle: "Configura gatillos para activar este namespace",
          add: "Agregar Trigger",
          keyword: "Palabra Clave",
          keywordDesc: "Trigger por palabra exacta",
          pattern: "Patrón",
          patternDesc: "Trigger por patrón regex",
          semanticMatch: "Coincidencia Semántica",
          semanticMatchDesc: "Trigger por similitud semántica (LLM)",
          examples: "Ejemplos",
          examplesPlaceholder: "turismo en Portugal, viajes, YYD, ...",
          priority: "Prioridad",
          priorityDesc: "Orden de precedencia (0-100, mayor = más prioritario)",
          confidence: "Confianza Mínima",
          confidenceDesc: "Umbral de confianza para activación (0-100%)",
          remove: "Eliminar",
          noTriggers: "No hay triggers configurados",
        },
        
        // PHASE 2: Analytics
        analytics: {
          title: "Analytics del Namespace",
          subtitle: "Métricas de uso y rendimiento",
          usageStats: "Estadísticas de Uso",
          detections: "Detecciones",
          detectionsDesc: "Cuántas veces se detectó este namespace",
          avgConfidence: "Confianza Promedio",
          avgConfidenceDesc: "Confianza promedio en detecciones",
          sliderImpact: "Impacto de Sliders",
          sliderImpactDesc: "Cuántas respuestas usaron sliders personalizados",
          promptOverrides: "Overrides de Prompt",
          promptOverridesDesc: "Cuántas respuestas usaron prompt personalizado",
          performance: "Rendimiento",
          avgLatency: "Latencia Promedio",
          successRate: "Tasa de Éxito",
          topTriggers: "Top Triggers",
          noData: "No hay datos disponibles",
          overrides: "Overrides",
          none: "Ninguno",
          priority: "Prioridad",
        },
        
        validation: {
          nameRequired: "Nombre obligatorio",
          nameRequiredDesc: "Por favor, ingresa un nombre para el namespace",
          invalidRootFormat: "Formato inválido para namespace raíz",
          rootNoSlash: "El namespace raíz no puede contener '/'",
          parentRequired: "Namespace padre obligatorio",
          selectParentDesc: "Selecciona el namespace padre para crear un sub-namespace",
          invalidFormat: "Formato inválido",
          subFormatError: "Sub-namespace debe estar en formato padre/hijo",
          sliderOutOfBounds: "Valor de slider inválido",
          sliderOutOfBoundsDesc: "Los valores deben estar entre 0 y 100",
          priorityRequired: "Prioridad obligatoria",
          confidenceOutOfBounds: "La confianza debe estar entre 0 y 100",
        },
        toast: {
          created: "¡Namespace creado!",
          updated: "¡Namespace actualizado!",
          deleted: "¡Namespace eliminado!",
          contentQueued: "¡Contenido agregado a la cola de curación!",
          indexError: "Error al indexar contenido",
          unknownError: "Error desconocido",
          customVersionCreated: "¡Versión personalizada creada!",
          slidersSaved: "¡Sliders guardados!",
          promptSaved: "¡Prompt guardado!",
          triggerAdded: "¡Trigger agregado!",
          triggerRemoved: "¡Trigger eliminado!",
          contentPendingHITL: "El contenido espera aprobación humana antes de ser indexado en la Knowledge Base",
          additionalContentPendingHITL: "El contenido adicional espera aprobación humana antes de ser indexado en la Knowledge Base",
        },
        
        pendingApprovalDesc: "El contenido espera aprobación humana antes de ser indexado en la Base de Conocimiento",
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
  
  // 🔥 FIX: Lowered threshold from 5 to 2 for better detection of short messages
  // Require minimum confidence (at least 2 matches)
  const minMatches = 2;
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

/**
 * Helper function for template interpolation with multiple placeholders
 * Avoids verbose chained .replace() calls
 * Handles repeated placeholders correctly using global regex
 * @example formatTemplate("Hello {name}, you have {count} messages", { name: "John", count: 5 })
 * @returns "Hello John, you have 5 messages"
 */
export const formatTemplate = (template: string, values: Record<string, string | number>): string => {
  return Object.entries(values).reduce(
    (result, [key, value]) => {
      const regex = new RegExp(`\\{${key}\\}`, 'g'); // Global regex to replace ALL occurrences
      return result.replace(regex, String(value));
    },
    template
  );
};
