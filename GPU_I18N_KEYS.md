# GPU MANAGEMENT I18N KEYS - COMPLETE STRUCTURE

## STRUCTURE (to add to admin.gpuManagement)

```typescript
// NEW KEYS TO ADD:
tabs: {
  overview: string; // "Visão Geral" | "Overview" | "Visión General"
  auth: string; // "Autenticação" | "Authentication" | "Autenticación"
  quotas: string; // "Quotas" | "Quotas" | "Cuotas"
  timeline: string; // "Timeline" | "Timeline" | "Cronología"
  workersCount: string; // "Workers ({count})" | "Workers ({count})" | "Workers ({count})"
},
autoRefresh: {
  title: string; // "Configuração de Auto-Refresh" | "Auto-Refresh Configuration" | "Configuración de Auto-Actualización"
  description: string; // "Frequência de atualização automática dos dados de quota" | "Automatic quota data refresh frequency" | "Frecuencia de actualización automática de datos de cuota"
  interval: string; // "Intervalo:" | "Interval:" | "Intervalo:"
  intervalOptions: {
    tenSeconds: string; // "10 segundos" | "10 seconds" | "10 segundos"
    thirtySeconds: string; // "30 segundos" | "30 seconds" | "30 segundos"
    oneMinute: string; // "1 minuto" | "1 minute" | "1 minuto"
    fiveMinutes: string; // "5 minutos" | "5 minutes" | "5 minutos"
  },
  status: {
    stale: string; // "Dados desatualizados (>10min)" | "Data stale (>10min)" | "Datos desactualizados (>10min)"
    updated: string; // "Dados atualizados" | "Data updated" | "Datos actualizados"
  }
},
auth: {
  title: string; // "Autenticação Google (Kaggle + Colab)" | "Google Authentication (Kaggle + Colab)" | "Autenticación Google (Kaggle + Colab)"
  description: string; // "Configure acesso seguro às plataformas de GPU via Google OAuth" | "Configure secure access to GPU platforms via Google OAuth" | "Configure acceso seguro a plataformas GPU vía Google OAuth"
  statusTitle: string; // "Status de Autenticação" | "Authentication Status" | "Estado de Autenticación"
  accountsConnectedCount: string; // "{count} conta(s) conectada(s)" | "{count} account(s) connected" | "{count} cuenta(s) conectada(s)"
  addAccount: string; // "Adicionar Conta" | "Add Account" | "Agregar Cuenta"
  connectAccount: string; // "Conectar Conta" | "Connect Account" | "Conectar Cuenta"
  connectedAccountsTitle: string; // "Contas Conectadas:" | "Connected Accounts:" | "Cuentas Conectadas:"
  providers: string; // "Provedores:" | "Providers:" | "Proveedores:"
  valid: string; // "Válido" | "Valid" | "Válido"
  expired: string; // "Expirado" | "Expired" | "Expirado"
},
quotas: {
  title: string; // "Quotas de GPU em Tempo Real" | "Real-Time GPU Quotas" | "Cuotas GPU en Tiempo Real"
  syncButton: string; // "Sincronizar Agora" | "Sync Now" | "Sincronizar Ahora"
  syncing: string; // "Sincronizando..." | "Syncing..." | "Sincronizando..."
  emptyMessage: string; // "Nenhuma quota disponível. Conecte uma conta Google para começar." | "No quota available. Connect a Google account to get started." | "No hay cuota disponible. Conecta una cuenta de Google para comenzar."
  emptyAction: string; // "Conectar Conta Google" | "Connect Google Account" | "Conectar Cuenta Google"
},
usageHistory: {
  title: string; // "Histórico de Uso" | "Usage History" | "Historial de Uso"
  description: string; // "Gráfico de consumo de quota ao longo do tempo" | "Quota consumption chart over time" | "Gráfico de consumo de cuota a lo largo del tiempo"
},
timeline: {
  title: string; // "Timeline de Sessões" | "Session Timeline" | "Cronología de Sesiones"
  description: string; // "Visualização das sessões ativas, cooldowns e próximas disponibilidades" | "Visualization of active sessions, cooldowns and next available slots" | "Visualización de sesiones activas, tiempos de espera y próximas disponibilidades"
  emptyMessage: string; // "Nenhuma sessão disponível. Conecte uma conta Google para visualizar a timeline." | "No sessions available. Connect a Google account to view the timeline." | "No hay sesiones disponibles. Conecta una cuenta de Google para ver la cronología."
},
timeTemplates: {
  week: string; // "Semana: {used}h / {max}h" | "Week: {used}h / {max}h" | "Semana: {used}h / {max}h"
  session: string; // "Sessão: {used}h / {max}h" | "Session: {used}h / {max}h" | "Sesión: {used}h / {max}h"
}
```

## FULL PT/EN/ES TRANSLATIONS

### PT-BR (Portuguese - Brazil)
```typescript
tabs: {
  overview: "Visão Geral",
  auth: "Autenticação",
  quotas: "Quotas",
  timeline: "Timeline",
  workersCount: "Workers ({count})",
},
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
  }
},
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
},
quotas: {
  title: "Quotas de GPU em Tempo Real",
  syncButton: "Sincronizar Agora",
  syncing: "Sincronizando...",
  emptyMessage: "Nenhuma quota disponível. Conecte uma conta Google para começar.",
  emptyAction: "Conectar Conta Google",
},
usageHistory: {
  title: "Histórico de Uso",
  description: "Gráfico de consumo de quota ao longo do tempo",
},
timeline: {
  title: "Timeline de Sessões",
  description: "Visualização das sessões ativas, cooldowns e próximas disponibilidades",
  emptyMessage: "Nenhuma sessão disponível. Conecte uma conta Google para visualizar a timeline.",
},
timeTemplates: {
  week: "Semana: {used}h / {max}h",
  session: "Sessão: {used}h / {max}h",
}
```

### EN-US (English - United States)
```typescript
tabs: {
  overview: "Overview",
  auth: "Authentication",
  quotas: "Quotas",
  timeline: "Timeline",
  workersCount: "Workers ({count})",
},
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
  }
},
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
},
quotas: {
  title: "Real-Time GPU Quotas",
  syncButton: "Sync Now",
  syncing: "Syncing...",
  emptyMessage: "No quota available. Connect a Google account to get started.",
  emptyAction: "Connect Google Account",
},
usageHistory: {
  title: "Usage History",
  description: "Quota consumption chart over time",
},
timeline: {
  title: "Session Timeline",
  description: "Visualization of active sessions, cooldowns and next available slots",
  emptyMessage: "No sessions available. Connect a Google account to view the timeline.",
},
timeTemplates: {
  week: "Week: {used}h / {max}h",
  session: "Session: {used}h / {max}h",
}
```

### ES-ES (Spanish - Spain)
```typescript
tabs: {
  overview: "Visión General",
  auth: "Autenticación",
  quotas: "Cuotas",
  timeline: "Cronología",
  workersCount: "Workers ({count})",
},
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
  }
},
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
},
quotas: {
  title: "Cuotas GPU en Tiempo Real",
  syncButton: "Sincronizar Ahora",
  syncing: "Sincronizando...",
  emptyMessage: "No hay cuota disponible. Conecta una cuenta de Google para comenzar.",
  emptyAction: "Conectar Cuenta Google",
},
usageHistory: {
  title: "Historial de Uso",
  description: "Gráfico de consumo de cuota a lo largo del tiempo",
},
timeline: {
  title: "Cronología de Sesiones",
  description: "Visualización de sesiones activas, tiempos de espera y próximas disponibilidades",
  emptyMessage: "No hay sesiones disponibles. Conecta una cuenta de Google para ver la cronología.",
},
timeTemplates: {
  week: "Semana: {used}h / {max}h",
  session: "Sesión: {used}h / {max}h",
}
```

## IMPLEMENTATION CHECKLIST

- [ ] Add TypeScript interface definitions to i18n.tsx
- [ ] Add PT-BR translations (~25 new keys)
- [ ] Add EN-US translations (~25 new keys)
- [ ] Add ES-ES translations (~25 new keys)
- [ ] Update GPUManagementTab.tsx to use new keys
- [ ] Handle template placeholders with `.replace('{count}', String(value))`
- [ ] Verify ZERO hardcoded strings with ripgrep
- [ ] Test locale switching (PT → EN → ES)
- [ ] Verify data-testid attributes unchanged
