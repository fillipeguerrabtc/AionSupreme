/**
 * RBAC Seed - Enterprise Role-Based Access Control
 * 
 * Seeds the database with:
 * 1. ALL granular permissions for every module/submodule
 * 2. Built-in roles (Super Admin, Admin, Manager, Editor, Viewer, Chat User)
 * 3. Role-Permission assignments
 * 4. Default admin user with password "123mudar"
 */

import { db } from "./db";
import { 
  permissions, 
  roles, 
  rolePermissions, 
  users, 
  userRoles,
  type InsertPermission,
  type InsertRole,
} from "../shared/schema";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcryptjs";

/**
 * PRODUCTION-READY: Complete list of ALL platform permissions
 * Format: "module:submodule:action"
 */
const ALL_PERMISSIONS: InsertPermission[] = [
  // Dashboard module
  { name: "View Dashboard", code: "dashboard:overview:read", module: "dashboard", submodule: "overview", action: "read", description: "View dashboard overview" },
  
  // Knowledge Base - Documents
  { name: "View Documents", code: "kb:documents:read", module: "kb", submodule: "documents", action: "read", description: "View KB documents" },
  { name: "Create Documents", code: "kb:documents:create", module: "kb", submodule: "documents", action: "create", description: "Create KB documents" },
  { name: "Edit Documents", code: "kb:documents:update", module: "kb", submodule: "documents", action: "update", description: "Edit KB documents" },
  { name: "Delete Documents", code: "kb:documents:delete", module: "kb", submodule: "documents", action: "delete", description: "Delete KB documents" },
  
  // Knowledge Base - Images
  { name: "View Images", code: "kb:images:read", module: "kb", submodule: "images", action: "read", description: "View KB images" },
  { name: "Upload Images", code: "kb:images:create", module: "kb", submodule: "images", action: "create", description: "Upload KB images" },
  { name: "Delete Images", code: "kb:images:delete", module: "kb", submodule: "images", action: "delete", description: "Delete KB images" },
  
  // Agents
  { name: "List Agents", code: "agents:list:read", module: "agents", submodule: "list", action: "read", description: "List specialist agents" },
  { name: "View Agent Details", code: "agents:details:read", module: "agents", submodule: "details", action: "read", description: "View agent details" },
  { name: "Create Agents", code: "agents:create:create", module: "agents", submodule: "create", action: "create", description: "Create new agents" },
  { name: "Edit Agents", code: "agents:update:update", module: "agents", submodule: "update", action: "update", description: "Edit agents" },
  { name: "Delete Agents", code: "agents:delete:delete", module: "agents", submodule: "delete", action: "delete", description: "Delete agents" },
  
  // Curation Queue (HITL)
  { name: "View Curation Queue", code: "curation:queue:read", module: "curation", submodule: "queue", action: "read", description: "View curation queue" },
  { name: "Manage Curation Queue", code: "curation:queue:manage", module: "curation", submodule: "queue", action: "manage", description: "Approve/reject items in queue" },
  
  // Namespaces
  { name: "List Namespaces", code: "namespaces:list:read", module: "namespaces", submodule: "list", action: "read", description: "List knowledge namespaces" },
  { name: "Create Namespaces", code: "namespaces:create:create", module: "namespaces", submodule: "create", action: "create", description: "Create namespaces" },
  { name: "Edit Namespaces", code: "namespaces:update:update", module: "namespaces", submodule: "update", action: "update", description: "Edit namespaces" },
  { name: "Delete Namespaces", code: "namespaces:delete:delete", module: "namespaces", submodule: "delete", action: "delete", description: "Delete namespaces" },
  
  // GPU Pool
  { name: "View GPU Pool", code: "gpu:pool:read", module: "gpu", submodule: "pool", action: "read", description: "View GPU pool status" },
  { name: "Execute GPU Operations", code: "gpu:pool:execute", module: "gpu", submodule: "pool", action: "execute", description: "Execute GPU operations" },
  { name: "Manage GPU Workers", code: "gpu:pool:manage", module: "gpu", submodule: "pool", action: "manage", description: "Manage GPU workers" },
  
  // Vision System
  { name: "View Vision Status", code: "vision:status:read", module: "vision", submodule: "status", action: "read", description: "View vision system status" },
  { name: "Process Images (Vision)", code: "vision:process:execute", module: "vision", submodule: "process", action: "execute", description: "Process images" },
  
  // Telemetry & Analytics
  { name: "View Telemetry", code: "telemetry:metrics:read", module: "telemetry", submodule: "metrics", action: "read", description: "View telemetry metrics" },
  { name: "View Usage Analytics", code: "telemetry:usage:read", module: "telemetry", submodule: "usage", action: "read", description: "View usage analytics" },
  
  // Training
  { name: "View Training Jobs", code: "training:jobs:read", module: "training", submodule: "jobs", action: "read", description: "View training jobs" },
  { name: "Execute Training Jobs", code: "training:jobs:execute", module: "training", submodule: "jobs", action: "execute", description: "Start/stop training jobs" },
  { name: "View Datasets", code: "training:datasets:read", module: "training", submodule: "datasets", action: "read", description: "View datasets" },
  { name: "Create Datasets", code: "training:datasets:create", module: "training", submodule: "datasets", action: "create", description: "Create datasets" },
  { name: "Delete Datasets", code: "training:datasets:delete", module: "training", submodule: "datasets", action: "delete", description: "Delete datasets" },
  
  // Settings
  { name: "View Timezone Settings", code: "settings:timezone:read", module: "settings", submodule: "timezone", action: "read", description: "View timezone settings" },
  { name: "Update Timezone", code: "settings:timezone:update", module: "settings", submodule: "timezone", action: "update", description: "Update timezone" },
  { name: "View Policies", code: "settings:policies:read", module: "settings", submodule: "policies", action: "read", description: "View policies" },
  { name: "Update Policies", code: "settings:policies:update", module: "settings", submodule: "policies", action: "update", description: "Update policies" },
  { name: "View System Settings", code: "settings:system:read", module: "settings", submodule: "system", action: "read", description: "View system settings" },
  { name: "Update System Settings", code: "settings:system:update", module: "settings", submodule: "system", action: "update", description: "Update system settings" },
  
  // Users & RBAC
  { name: "List Users", code: "users:list:read", module: "users", submodule: "list", action: "read", description: "List users" },
  { name: "View User Details", code: "users:details:read", module: "users", submodule: "details", action: "read", description: "View user details" },
  { name: "Create Users", code: "users:create:create", module: "users", submodule: "create", action: "create", description: "Create new users" },
  { name: "Edit Users", code: "users:update:update", module: "users", submodule: "update", action: "update", description: "Edit users" },
  { name: "Delete Users", code: "users:delete:delete", module: "users", submodule: "delete", action: "delete", description: "Delete users" },
  { name: "Manage User Roles", code: "users:roles:manage", module: "users", submodule: "roles", action: "manage", description: "Assign/remove user roles" },
  
  // Roles Management
  { name: "List Roles", code: "roles:list:read", module: "roles", submodule: "list", action: "read", description: "List roles" },
  { name: "Create Custom Roles", code: "roles:create:create", module: "roles", submodule: "create", action: "create", description: "Create custom roles" },
  { name: "Edit Roles", code: "roles:update:update", module: "roles", submodule: "update", action: "update", description: "Edit roles" },
  { name: "Delete Custom Roles", code: "roles:delete:delete", module: "roles", submodule: "delete", action: "delete", description: "Delete custom roles" },
  { name: "Manage Role Permissions", code: "roles:permissions:manage", module: "roles", submodule: "permissions", action: "manage", description: "Assign permissions to roles" },
  
  // Chat Interface
  { name: "Read Chat Messages", code: "chat:messages:read", module: "chat", submodule: "messages", action: "read", description: "Read chat messages" },
  { name: "Send Chat Messages", code: "chat:messages:create", module: "chat", submodule: "messages", action: "create", description: "Send chat messages" },
  { name: "View Chat History", code: "chat:history:read", module: "chat", submodule: "history", action: "read", description: "View chat history" },
];

/**
 * Built-in roles with permission assignments
 */
const BUILT_IN_ROLES: Array<InsertRole & { permissions: string[] }> = [
  {
    name: "Super Admin",
    description: "Full access to everything including system settings",
    isSystemRole: true,
    permissions: ALL_PERMISSIONS.map(p => p.code), // ALL permissions
  },
  {
    name: "Admin",
    description: "Full access except critical system settings",
    isSystemRole: true,
    permissions: ALL_PERMISSIONS
      .filter(p => !(p.module === "settings" && p.submodule === "system"))
      .map(p => p.code),
  },
  {
    name: "Manager",
    description: "Can manage content and users (no system settings or deletion)",
    isSystemRole: true,
    permissions: ALL_PERMISSIONS
      .filter(p => 
        p.action !== "delete" && 
        p.module !== "settings" &&
        !(p.module === "roles" && p.action === "delete")
      )
      .map(p => p.code),
  },
  {
    name: "Editor",
    description: "Can create and edit content (no deletion or user management)",
    isSystemRole: true,
    permissions: ALL_PERMISSIONS
      .filter(p => 
        (p.action === "read" || p.action === "create" || p.action === "update") &&
        p.module !== "users" &&
        p.module !== "roles" &&
        p.module !== "settings"
      )
      .map(p => p.code),
  },
  {
    name: "Viewer",
    description: "Read-only access to all content",
    isSystemRole: true,
    permissions: ALL_PERMISSIONS
      .filter(p => p.action === "read")
      .map(p => p.code),
  },
  {
    name: "Chat User",
    description: "Can only use chat interface (no admin access)",
    isSystemRole: true,
    permissions: [
      "chat:messages:read",
      "chat:messages:create",
      "chat:history:read",
    ],
  },
];

/**
 * Seed RBAC system (100% IDEMPOTENT - only runs once)
 */
export async function seedRBAC() {
  console.log("[RBAC Seed] 🔐 Checking RBAC system...");
  
  try {
    // PRODUCTION: Check if seed already ran (idempotent)
    const existingPermissions = await db.select().from(permissions).limit(1);
    if (existingPermissions.length > 0) {
      console.log("[RBAC Seed] ✅ RBAC system already initialized (skipping seed)");
      return;
    }
    
    console.log("[RBAC Seed] 🆕 First-time initialization - creating RBAC system...");
    
    // 1. Seed ALL permissions
    console.log(`[RBAC Seed] Creating ${ALL_PERMISSIONS.length} granular permissions...`);
    for (const perm of ALL_PERMISSIONS) {
      await db.insert(permissions)
        .values(perm)
        .onConflictDoNothing({ target: permissions.code });
    }
    console.log(`[RBAC Seed] ✅ ${ALL_PERMISSIONS.length} permissions created`);
    
    // 2. Seed built-in roles
    console.log(`[RBAC Seed] Creating ${BUILT_IN_ROLES.length} built-in roles...`);
    const roleMap = new Map<string, number>();
    
    for (const roleData of BUILT_IN_ROLES) {
      const { permissions: _, ...roleInsert } = roleData;
      
      const [role] = await db.insert(roles)
        .values(roleInsert)
        .onConflictDoUpdate({
          target: roles.name,
          set: { 
            description: roleInsert.description,
            isSystemRole: roleInsert.isSystemRole,
          }
        })
        .returning();
      
      roleMap.set(roleData.name, role.id);
    }
    console.log(`[RBAC Seed] ✅ ${BUILT_IN_ROLES.length} roles created`);
    
    // 3. Assign permissions to roles
    console.log("[RBAC Seed] Assigning permissions to roles...");
    for (const roleData of BUILT_IN_ROLES) {
      const roleId = roleMap.get(roleData.name)!;
      
      // Get permission IDs
      const permIds = await db.select({ id: permissions.id })
        .from(permissions)
        .where(
          eq(permissions.code, roleData.permissions[0]) // Dummy for typing
        );
      
      // Assign each permission
      for (const permCode of roleData.permissions) {
        const [perm] = await db.select({ id: permissions.id })
          .from(permissions)
          .where(eq(permissions.code, permCode));
        
        if (perm) {
          await db.insert(rolePermissions)
            .values({
              roleId,
              permissionId: perm.id,
            })
            .onConflictDoNothing({ 
              target: [rolePermissions.roleId, rolePermissions.permissionId] 
            });
        }
      }
      
      console.log(`[RBAC Seed]   ✓ ${roleData.name}: ${roleData.permissions.length} permissions`);
    }
    console.log("[RBAC Seed] ✅ Permission assignments complete");
    
    // 4. Create default admin user (PRODUCTION-SAFE: Never overwrites existing password)
    console.log("[RBAC Seed] Checking for admin user...");
    
    // Check if admin user already exists
    const existingAdmin = await db.select()
      .from(users)
      .where(eq(users.email, "admin@aion.local"))
      .limit(1);
    
    let adminUser: typeof users.$inferSelect;
    
    if (existingAdmin.length > 0) {
      // Admin already exists - DO NOT TOUCH PASSWORD!
      adminUser = existingAdmin[0];
      console.log(`[RBAC Seed] ℹ️  Admin user already exists: ${adminUser.email}`);
      console.log(`[RBAC Seed] ✅ Password preserved (no changes made)`);
    } else {
      // Create new admin user with default password
      const passwordHash = await bcrypt.hash("123mudar", 10);
      
      [adminUser] = await db.insert(users)
        .values({
          email: "admin@aion.local",
          firstName: "System",
          lastName: "Administrator",
          password: passwordHash,
          emailVerified: true,
          authProvider: "local",
        })
        .returning();
      
      console.log(`[RBAC Seed] ✅ NEW admin user created: ${adminUser.email}`);
      console.log(`[RBAC Seed] 🔑 DEFAULT Password: 123mudar`);
      console.log(`[RBAC Seed] ⚠️  CHANGE PASSWORD IMMEDIATELY AFTER FIRST LOGIN!`);
    }
    
    // 5. Assign Super Admin role to admin user
    const superAdminRoleId = roleMap.get("Super Admin")!;
    
    await db.insert(userRoles)
      .values({
        userId: adminUser.id,
        roleId: superAdminRoleId,
        assignedBy: adminUser.id, // Self-assigned
      })
      .onConflictDoNothing({
        target: [userRoles.userId, userRoles.roleId]
      });
    
    console.log("[RBAC Seed] ✅ Super Admin role assigned to admin user");
    
    console.log("\n╔════════════════════════════════════════════════════════════════╗");
    console.log("║   🔐 RBAC SYSTEM INITIALIZED SUCCESSFULLY                      ║");
    console.log("╠════════════════════════════════════════════════════════════════╣");
    console.log("║                                                                ║");
    console.log("║   📊 STATISTICS:                                               ║");
    console.log(`║   • ${ALL_PERMISSIONS.length} granular permissions created                       ║`);
    console.log(`║   • ${BUILT_IN_ROLES.length} built-in roles configured                          ║`);
    console.log("║   • 1 admin user created                                       ║");
    console.log("║                                                                ║");
    console.log("║   🔑 DEFAULT ADMIN CREDENTIALS:                                ║");
    console.log("║   • Email: admin@aion.local                                    ║");
    console.log("║   • Password: 123mudar                                         ║");
    console.log("║                                                                ║");
    console.log("║   ⚠️  SECURITY WARNING:                                        ║");
    console.log("║   CHANGE THE DEFAULT PASSWORD IMMEDIATELY AFTER FIRST LOGIN!  ║");
    console.log("║                                                                ║");
    console.log("╚════════════════════════════════════════════════════════════════╝");
    
  } catch (error) {
    console.error("[RBAC Seed] ❌ Failed to seed RBAC system:", error);
    throw error;
  }
}
