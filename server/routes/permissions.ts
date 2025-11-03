/**
 * Permissions API Routes
 * 
 * Provides REST endpoints for managing roles and permissions (RBAC):
 * - GET /permissions - List all permissions
 * - GET /roles - List all roles
 * - GET /roles/:id - Get single role
 * - GET /roles/:id/permissions - List permissions for a role
 * - POST /roles/:id/permissions - Assign permission to role
 * - DELETE /roles/:id/permissions/:permissionId - Revoke permission from role
 * - GET /users/:userId/permissions - Get all permissions for a user
 * 
 * All routes require admin authentication.
 */

import type { Request, Response, Router } from "express";
import { storage } from "../storage";

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
   * Get all permissions for a user (combines all permissions from all their roles)
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

  console.log("[Permissions Routes] ✅ 7 RBAC routes registered successfully");
}
