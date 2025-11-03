export type PermissionAction = 'read' | 'create' | 'update' | 'delete' | 'manage' | 'execute' | 'approve' | 'reject';

export interface SubmoduleDefinition {
  slug: string;
  labelKey: string;
  actions: PermissionAction[];
}

export interface ModuleDefinition {
  slug: string;
  labelKey: string;
  submodules: SubmoduleDefinition[];
}

export const PERMISSIONS_CATALOG: ModuleDefinition[] = [
  {
    slug: 'dashboard',
    labelKey: 'permissions.modules.dashboard',
    submodules: [
      {
        slug: 'overview',
        labelKey: 'permissions.submodules.dashboard.overview',
        actions: ['read']
      }
    ]
  },
  {
    slug: 'telemetry',
    labelKey: 'permissions.modules.telemetry',
    submodules: [
      {
        slug: 'metrics',
        labelKey: 'permissions.submodules.telemetry.metrics',
        actions: ['read']
      },
      {
        slug: 'usage',
        labelKey: 'permissions.submodules.telemetry.usage',
        actions: ['read']
      }
    ]
  },
  {
    slug: 'kb',
    labelKey: 'permissions.modules.kb',
    submodules: [
      {
        slug: 'documents',
        labelKey: 'permissions.submodules.kb.documents',
        actions: ['read', 'create', 'update', 'delete', 'manage']
      },
      {
        slug: 'images',
        labelKey: 'permissions.submodules.kb.images',
        actions: ['read', 'create', 'update', 'delete', 'manage']
      }
    ]
  },
  {
    slug: 'gpu',
    labelKey: 'permissions.modules.gpu',
    submodules: [
      {
        slug: 'pool',
        labelKey: 'permissions.submodules.gpu.pool',
        actions: ['read', 'execute', 'manage']
      }
    ]
  },
  {
    slug: 'training',
    labelKey: 'permissions.modules.training',
    submodules: [
      {
        slug: 'jobs',
        labelKey: 'permissions.submodules.training.jobs',
        actions: ['read', 'execute']
      },
      {
        slug: 'datasets',
        labelKey: 'permissions.submodules.training.datasets',
        actions: ['read', 'create', 'delete']
      }
    ]
  },
  {
    slug: 'settings',
    labelKey: 'permissions.modules.settings',
    submodules: [
      {
        slug: 'system',
        labelKey: 'permissions.submodules.settings.system',
        actions: ['read', 'update', 'manage']
      }
    ]
  },
  {
    slug: 'agents',
    labelKey: 'permissions.modules.agents',
    submodules: [
      {
        slug: 'list',
        labelKey: 'permissions.submodules.agents.list',
        actions: ['read', 'create', 'update', 'delete']
      }
    ]
  },
  {
    slug: 'users',
    labelKey: 'permissions.modules.users',
    submodules: [
      {
        slug: 'list',
        labelKey: 'permissions.submodules.users.list',
        actions: ['read', 'create', 'update', 'delete', 'manage']
      }
    ]
  },
  {
    slug: 'roles',
    labelKey: 'permissions.modules.roles',
    submodules: [
      {
        slug: 'permissions',
        labelKey: 'permissions.submodules.roles.permissions',
        actions: ['read', 'create', 'update', 'delete', 'manage']
      }
    ]
  },
  {
    slug: 'curation',
    labelKey: 'permissions.modules.curation',
    submodules: [
      {
        slug: 'queue',
        labelKey: 'permissions.submodules.curation.queue',
        actions: ['read', 'update', 'approve', 'reject']
      }
    ]
  },
  {
    slug: 'vision',
    labelKey: 'permissions.modules.vision',
    submodules: [
      {
        slug: 'status',
        labelKey: 'permissions.submodules.vision.status',
        actions: ['read', 'execute']
      }
    ]
  },
  {
    slug: 'namespaces',
    labelKey: 'permissions.modules.namespaces',
    submodules: [
      {
        slug: 'list',
        labelKey: 'permissions.submodules.namespaces.list',
        actions: ['read', 'create', 'update', 'delete']
      }
    ]
  },
  {
    slug: 'admin',
    labelKey: 'permissions.modules.admin',
    submodules: [
      {
        slug: 'settings',
        labelKey: 'permissions.submodules.admin.settings',
        actions: ['read', 'update', 'manage']
      }
    ]
  }
];

export function generatePermissionCode(module: string, submodule: string, action: PermissionAction): string {
  return `${module}:${submodule}:${action}`;
}

export function parsePermissionCode(code: string): { module: string; submodule: string; action: PermissionAction } | null {
  const parts = code.split(':');
  if (parts.length !== 3) return null;
  
  const [module, submodule, action] = parts;
  if (!isValidAction(action)) return null;
  
  return { module, submodule, action: action as PermissionAction };
}

export function isValidAction(action: string): action is PermissionAction {
  return ['read', 'create', 'update', 'delete', 'manage', 'execute', 'approve', 'reject'].includes(action);
}

export function getModuleBySlug(slug: string): ModuleDefinition | undefined {
  return PERMISSIONS_CATALOG.find(m => m.slug === slug);
}

export function getSubmoduleBySlug(moduleSlug: string, submoduleSlug: string): SubmoduleDefinition | undefined {
  const module = getModuleBySlug(moduleSlug);
  return module?.submodules.find(s => s.slug === submoduleSlug);
}

export function validatePermissionSelection(module: string, submodule: string, actions: PermissionAction[]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  const moduleDefinition = getModuleBySlug(module);
  if (!moduleDefinition) {
    errors.push(`Invalid module: ${module}`);
    return { valid: false, errors };
  }
  
  const submoduleDefinition = getSubmoduleBySlug(module, submodule);
  if (!submoduleDefinition) {
    errors.push(`Invalid submodule: ${submodule} in module ${module}`);
    return { valid: false, errors };
  }
  
  if (actions.length === 0) {
    errors.push('At least one action must be selected');
    return { valid: false, errors };
  }
  
  const invalidActions = actions.filter(action => !submoduleDefinition.actions.includes(action));
  if (invalidActions.length > 0) {
    errors.push(`Invalid actions for ${module}:${submodule}: ${invalidActions.join(', ')}`);
    return { valid: false, errors };
  }
  
  return { valid: true, errors: [] };
}

export function getAllPermissionCodes(): string[] {
  const codes: string[] = [];
  
  for (const module of PERMISSIONS_CATALOG) {
    for (const submodule of module.submodules) {
      for (const action of submodule.actions) {
        codes.push(generatePermissionCode(module.slug, submodule.slug, action));
      }
    }
  }
  
  return codes;
}
