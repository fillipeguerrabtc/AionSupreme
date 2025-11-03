/**
 * Permissions API Routes
 * 
 * Provides REST endpoints for managing roles and permissions (RBAC):
 * - GET /permissions - List all permissions
 * - POST /permissions - Create new permission
 * - PUT /permissions/:id - Update permission
 * - DELETE /permissions/:id - Delete permission (with usage check)
 * - GET /permissions/:id/usage - Check permission usage
 * - GET /roles - List all roles
 * - GET /roles/:id - Get single role
 * - GET /roles/:id/permissions - List permissions for a role
 * - POST /roles/:id/permissions - Assign permission to role
 * - DELETE /roles/:id/permissions/:permissionId - Revoke permission from role
 * - GET /users/:userId/permissions - Get all permissions for a user (role + user-specific)
 * - GET /users/:userId/specific-permissions - Get user-specific permissions only
 * - POST /users/:userId/permissions - Assign permission directly to user
 * - DELETE /users/:userId/permissions/:permissionId - Revoke user-specific permission
 * 
 * All routes require admin authentication.
 */

import type { Request, Response, Router } from "express";
import { storage } from "../storage";
import { insertPermissionSchema } from "@shared/schema";

export function registerPermissionsRoutes(app: Router) {
  console.log("[Permissions Routes] Registering RBAC API routes...");

  // ============================================================================
  // PERMISSIONS
  // ============================================================================

  /**
   * GET /permissions
   * List all permissions in the system
   */
  app.get("/permissions", async (req: Request, res: Response) => {
    try {
      const allPermissions = await storage.getPermissions();
      res.json(allPermissions);
    } catch (error) {
      console.error("Error fetching permissions:", error);
      res.status(500).json({
        error: "Failed to fetch permissions",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /permissions
   * Create a new permission
   * Body: { code: string, module: string, submodule: string, action: string, description?: string }
   */
  app.post("/permissions", async (req: Request, res: Response) => {
    try {
      const validatedData = insertPermissionSchema.parse(req.body);
      
      // Check if permission code already exists
      const existing = await storage.getPermissions();
      if (existing.some(p => p.code === validatedData.code)) {
        return res.status(400).json({ error: "Permission code already exists" });
      }
      
      const newPermission = await storage.createPermission(validatedData);
      res.status(201).json(newPermission);
    } catch (error) {
      console.error("Error creating permission:", error);
      res.status(500).json({
        error: "Failed to create permission",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * PUT /permissions/:id
   * Update an existing permission
   * Body: Partial<{ code: string, module: string, submodule: string, action: string, description?: string }>
   */
  app.put("/permissions/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const permissionId = parseInt(id, 10);
      
      // Verify permission exists
      const existing = await storage.getPermission(permissionId);
      if (!existing) {
        return res.status(404).json({ error: "Permission not found" });
      }
      
      // If updating code, check for duplicates
      if (req.body.code && req.body.code !== existing.code) {
        const allPermissions = await storage.getPermissions();
        if (allPermissions.some(p => p.code === req.body.code && p.id !== permissionId)) {
          return res.status(400).json({ error: "Permission code already exists" });
        }
      }
      
      const updated = await storage.updatePermission(permissionId, req.body);
      res.json(updated);
    } catch (error) {
      console.error("Error updating permission:", error);
      res.status(500).json({
        error: "Failed to update permission",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /permissions/:id/usage
   * Check if permission is in use (assigned to roles or users)
   */
  app.get("/permissions/:id/usage", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const permissionId = parseInt(id, 10);
      
      // Verify permission exists
      const existing = await storage.getPermission(permissionId);
      if (!existing) {
        return res.status(404).json({ error: "Permission not found" });
      }
      
      const usage = await storage.checkPermissionUsage(permissionId);
      res.json(usage);
    } catch (error) {
      console.error("Error checking permission usage:", error);
      res.status(500).json({
        error: "Failed to check permission usage",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * DELETE /permissions/:id
   * Delete a permission (only if not in use)
   */
  app.delete("/permissions/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const permissionId = parseInt(id, 10);
      
      // Verify permission exists
      const existing = await storage.getPermission(permissionId);
      if (!existing) {
        return res.status(404).json({ error: "Permission not found" });
      }
      
      // Check usage before deleting
      const usage = await storage.checkPermissionUsage(permissionId);
      if (usage.inUse) {
        return res.status(400).json({
          error: "Cannot delete permission in use",
          message: `Permission is assigned to ${usage.roleCount} role(s) and ${usage.userCount} user(s)`,
          usage,
        });
      }
      
      await storage.deletePermission(permissionId);
      res.json({ success: true, message: "Permission deleted successfully" });
    } catch (error) {
      console.error("Error deleting permission:", error);
      res.status(500).json({
        error: "Failed to delete permission",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // ============================================================================
  // ROLES
  // ============================================================================

  /**
   * GET /roles
   * List all roles in the system
   */
  app.get("/roles", async (req: Request, res: Response) => {
    try {
      const allRoles = await storage.getRoles();
      res.json(allRoles);
    } catch (error) {
      console.error("Error fetching roles:", error);
      res.status(500).json({
        error: "Failed to fetch roles",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /roles/:id
   * Get a single role by ID
   */
  app.get("/roles/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const role = await storage.getRole(parseInt(id, 10));
      
      if (!role) {
        return res.status(404).json({ error: "Role not found" });
      }
      
      res.json(role);
    } catch (error) {
      console.error("Error fetching role:", error);
      res.status(500).json({
        error: "Failed to fetch role",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /roles/:id/permissions
   * List all permissions assigned to a specific role
   */
  app.get("/roles/:id/permissions", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const role = await storage.getRole(parseInt(id, 10));
      
      if (!role) {
        return res.status(404).json({ error: "Role not found" });
      }
      
      const permissions = await storage.getRolePermissions(parseInt(id, 10));
      res.json(permissions);
    } catch (error) {
      console.error("Error fetching role permissions:", error);
      res.status(500).json({
        error: "Failed to fetch role permissions",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /roles/:id/permissions
   * Assign a permission to a role
   * Body: { permissionId: number }
   */
  app.post("/roles/:id/permissions", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { permissionId } = req.body;
      
      if (!permissionId) {
        return res.status(400).json({ error: "permissionId is required" });
      }
      
      const role = await storage.getRole(parseInt(id, 10));
      if (!role) {
        return res.status(404).json({ error: "Role not found" });
      }
      
      // Verify permission exists
      const allPermissions = await storage.getPermissions();
      const permission = allPermissions.find(p => p.id === parseInt(permissionId, 10));
      if (!permission) {
        return res.status(404).json({ error: "Permission not found" });
      }
      
      // Check if role already has this permission
      const existingPermissions = await storage.getRolePermissions(parseInt(id, 10));
      if (existingPermissions.some(p => p.id === parseInt(permissionId, 10))) {
        return res.status(400).json({ error: "Role already has this permission" });
      }
      
      await storage.assignPermissionToRole(parseInt(id, 10), parseInt(permissionId, 10));
      
      // Return updated permissions list
      const updatedPermissions = await storage.getRolePermissions(parseInt(id, 10));
      
      res.json({
        success: true,
        permissions: updatedPermissions,
      });
    } catch (error) {
      console.error("Error assigning permission to role:", error);
      res.status(500).json({
        error: "Failed to assign permission to role",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * DELETE /roles/:id/permissions/:permissionId
   * Revoke a permission from a role
   */
  app.delete("/roles/:id/permissions/:permissionId", async (req: Request, res: Response) => {
    try {
      const { id, permissionId } = req.params;
      
      const role = await storage.getRole(parseInt(id, 10));
      if (!role) {
        return res.status(404).json({ error: "Role not found" });
      }
      
      // Verify role has this permission
      const existingPermissions = await storage.getRolePermissions(parseInt(id, 10));
      if (!existingPermissions.some(p => p.id === parseInt(permissionId, 10))) {
        return res.status(404).json({ error: "Role does not have this permission" });
      }
      
      await storage.revokePermissionFromRole(parseInt(id, 10), parseInt(permissionId, 10));
      
      // Return updated permissions list
      const updatedPermissions = await storage.getRolePermissions(parseInt(id, 10));
      
      res.json({
        success: true,
        permissions: updatedPermissions,
      });
    } catch (error) {
      console.error("Error revoking permission from role:", error);
      res.status(500).json({
        error: "Failed to revoke permission from role",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // ============================================================================
  // USER PERMISSIONS
  // ============================================================================

  /**
   * GET /users/:userId/permissions
   * Get all permissions for a user (combines role-based + user-specific permissions)
   */
  app.get("/users/:userId/permissions", async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const permissions = await storage.getUserPermissions(userId);
      res.json(permissions);
    } catch (error) {
      console.error("Error fetching user permissions:", error);
      res.status(500).json({
        error: "Failed to fetch user permissions",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /users/:userId/specific-permissions
   * Get user-specific permissions only (not from roles)
   */
  app.get("/users/:userId/specific-permissions", async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const permissions = await storage.getUserSpecificPermissions(userId);
      res.json(permissions);
    } catch (error) {
      console.error("Error fetching user-specific permissions:", error);
      res.status(500).json({
        error: "Failed to fetch user-specific permissions",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /users/:userId/permissions
   * Assign a permission directly to a user (in addition to role permissions)
   * Body: { permissionId: number }
   */
  app.post("/users/:userId/permissions", async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const { permissionId } = req.body;
      
      if (!permissionId) {
        return res.status(400).json({ error: "permissionId is required" });
      }
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Verify permission exists
      const permission = await storage.getPermission(parseInt(permissionId, 10));
      if (!permission) {
        return res.status(404).json({ error: "Permission not found" });
      }
      
      // Check if user already has this specific permission
      const existingPerms = await storage.getUserSpecificPermissions(userId);
      if (existingPerms.some(p => p.id === parseInt(permissionId, 10))) {
        return res.status(400).json({ error: "User already has this specific permission" });
      }
      
      // Get current admin user ID for audit trail (if available from session)
      const assignedBy = (req.user as any)?.id;
      
      await storage.assignPermissionToUser(userId, parseInt(permissionId, 10), assignedBy);
      
      // Return updated permissions list
      const updatedPermissions = await storage.getUserSpecificPermissions(userId);
      
      res.json({
        success: true,
        permissions: updatedPermissions,
      });
    } catch (error) {
      console.error("Error assigning permission to user:", error);
      res.status(500).json({
        error: "Failed to assign permission to user",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * DELETE /users/:userId/permissions/:permissionId
   * Revoke a user-specific permission
   */
  app.delete("/users/:userId/permissions/:permissionId", async (req: Request, res: Response) => {
    try {
      const { userId, permissionId } = req.params;
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Verify user has this specific permission
      const existingPerms = await storage.getUserSpecificPermissions(userId);
      if (!existingPerms.some(p => p.id === parseInt(permissionId, 10))) {
        return res.status(404).json({ error: "User does not have this specific permission" });
      }
      
      await storage.revokePermissionFromUser(userId, parseInt(permissionId, 10));
      
      // Return updated permissions list
      const updatedPermissions = await storage.getUserSpecificPermissions(userId);
      
      res.json({
        success: true,
        permissions: updatedPermissions,
      });
    } catch (error) {
      console.error("Error revoking permission from user:", error);
      res.status(500).json({
        error: "Failed to revoke permission from user",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  console.log("[Permissions Routes] ✅ 15 RBAC routes registered successfully");
}
