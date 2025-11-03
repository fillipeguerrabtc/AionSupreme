/**
 * USER MANAGEMENT ROUTES
 * Gerenciamento completo de usuários para administradores
 */

import type { Router, Request, Response } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { users, userRoles, roles } from "@shared/schema";
import { eq, and } from "drizzle-orm";

/**
 * Sanitize user object to remove sensitive fields
 * CRITICAL SECURITY: Never expose password hashes or reset tokens to clients
 * 
 * @param user - User object from storage (may contain sensitive fields)
 * @returns Safe user object without password/token fields
 */
function sanitizeUser<T extends { password?: string | null; resetToken?: string | null; resetTokenExpiry?: Date | null }>(
  user: T
): Omit<T, 'password' | 'resetToken' | 'resetTokenExpiry'> {
  if (!user) return user as any;
  
  const { password, resetToken, resetTokenExpiry, ...safeUser } = user;
  return safeUser;
}

export function registerUserRoutes(app: Router) {
  /**
   * GET /api/admin/users
   * Lista todos os usuários do sistema
   */
  app.get("/users", async (req: Request, res: Response) => {
    try {
      const { limit } = req.query;
      const limitNum = limit && typeof limit === "string" ? parseInt(limit, 10) : 100;
      
      const allUsers = await storage.getUsers(limitNum);
      
      // Buscar roles de cada usuário
      const usersWithRoles = await Promise.all(
        allUsers.map(async (user) => {
          const userRolesList = await storage.getUserRoles(user.id);
          return {
            ...sanitizeUser(user),
            roles: userRolesList.map(r => r.name),
            isAdmin: userRolesList.some(r => 
              r.name === 'Super Admin' || 
              r.name === 'Admin' || 
              r.name === 'Content Manager'
            ),
          };
        })
      );
      
      res.json(usersWithRoles);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({
        error: "Failed to fetch users",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /api/admin/users/:id
   * Obtém detalhes de um usuário específico
   */
  app.get("/users/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      
      const user = await storage.getUser(id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const userRolesList = await storage.getUserRoles(id);
      const userWithRoles = {
        ...sanitizeUser(user),
        roles: userRolesList.map(r => r.name),
        isAdmin: userRolesList.some(r => 
          r.name === 'Super Admin' || 
          r.name === 'Admin' || 
          r.name === 'Content Manager'
        ),
      };
      
      res.json(userWithRoles);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({
        error: "Failed to fetch user",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /api/admin/users
   * Cria um novo usuário
   */
  app.post("/users", async (req: Request, res: Response) => {
    try {
      const { email, name, password, roleIds } = req.body;
      
      if (!email || !name) {
        return res.status(400).json({ error: "Email and name are required" });
      }
      
      // Verificar se email já existe
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ error: "Email already in use" });
      }
      
      // Criar usuário
      const userData: any = {
        email,
        name,
        userType: 'dashboard', // Default para dashboard users
      };
      
      if (password) {
        const bcrypt = await import('bcryptjs');
        userData.password = await bcrypt.hash(password, 10);
      }
      
      const user = await storage.createUser(userData);
      
      // Atribuir roles se fornecidas
      if (roleIds && Array.isArray(roleIds)) {
        for (const roleId of roleIds) {
          await db.insert(userRoles).values({
            userId: user.id,
            roleId: parseInt(roleId, 10),
          });
        }
      }
      
      // Buscar roles do usuário criado
      const userRolesList = await storage.getUserRoles(user.id);
      const userWithRoles = {
        ...sanitizeUser(user),
        roles: userRolesList.map(r => r.name),
        isAdmin: userRolesList.some(r => 
          r.name === 'Super Admin' || 
          r.name === 'Admin' || 
          r.name === 'Content Manager'
        ),
      };
      
      res.json(userWithRoles);
    } catch (error) {
      console.error("Error creating user:", error);
      res.status(500).json({
        error: "Failed to create user",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * PUT /api/admin/users/:id
   * Atualiza um usuário existente
   */
  app.put("/users/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { email, name, password, userType } = req.body;
      
      const existingUser = await storage.getUser(id);
      if (!existingUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const updateData: any = {};
      if (email) updateData.email = email;
      if (name) updateData.name = name;
      if (userType) updateData.userType = userType;
      
      if (password) {
        const bcrypt = await import('bcryptjs');
        updateData.password = await bcrypt.hash(password, 10);
      }
      
      const updatedUser = await storage.updateUser(id, updateData);
      
      // Buscar roles do usuário
      const userRolesList = await storage.getUserRoles(id);
      const userWithRoles = {
        ...sanitizeUser(updatedUser),
        roles: userRolesList.map(r => r.name),
        isAdmin: userRolesList.some(r => 
          r.name === 'Super Admin' || 
          r.name === 'Admin' || 
          r.name === 'Content Manager'
        ),
      };
      
      res.json(userWithRoles);
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(500).json({
        error: "Failed to update user",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * DELETE /api/admin/users/:id
   * Deleta um usuário
   */
  app.delete("/users/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      
      const existingUser = await storage.getUser(id);
      if (!existingUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Remover roles do usuário primeiro (cascade delete)
      await db.delete(userRoles).where(eq(userRoles.userId, id));
      
      // Deletar usuário
      await storage.deleteUser(id);
      
      res.json({ success: true, message: "User deleted successfully" });
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({
        error: "Failed to delete user",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * POST /api/admin/users/:id/roles
   * Adiciona uma role a um usuário
   */
  app.post("/users/:id/roles", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { roleId } = req.body;
      
      if (!roleId) {
        return res.status(400).json({ error: "roleId is required" });
      }
      
      const existingUser = await storage.getUser(id);
      if (!existingUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Verificar se role existe
      const [role] = await db.select().from(roles).where(eq(roles.id, parseInt(roleId, 10)));
      if (!role) {
        return res.status(404).json({ error: "Role not found" });
      }
      
      // Verificar se usuário já tem a role
      const existingUserRole = await db
        .select()
        .from(userRoles)
        .where(and(
          eq(userRoles.userId, id),
          eq(userRoles.roleId, parseInt(roleId, 10))
        ));
      
      if (existingUserRole.length > 0) {
        return res.status(400).json({ error: "User already has this role" });
      }
      
      // Adicionar role ao usuário
      await db.insert(userRoles).values({
        userId: id,
        roleId: parseInt(roleId, 10),
      });
      
      // Buscar roles atualizadas
      const userRolesList = await storage.getUserRoles(id);
      
      res.json({
        success: true,
        roles: userRolesList.map(r => r.name),
      });
    } catch (error) {
      console.error("Error adding role to user:", error);
      res.status(500).json({
        error: "Failed to add role to user",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * DELETE /api/admin/users/:id/roles/:roleId
   * Remove uma role de um usuário
   */
  app.delete("/users/:id/roles/:roleId", async (req: Request, res: Response) => {
    try {
      const { id, roleId } = req.params;
      
      const existingUser = await storage.getUser(id);
      if (!existingUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Remover role do usuário
      await db.delete(userRoles).where(and(
        eq(userRoles.userId, id),
        eq(userRoles.roleId, parseInt(roleId, 10))
      ));
      
      // Buscar roles atualizadas
      const userRolesList = await storage.getUserRoles(id);
      
      res.json({
        success: true,
        roles: userRolesList.map(r => r.name),
      });
    } catch (error) {
      console.error("Error removing role from user:", error);
      res.status(500).json({
        error: "Failed to remove role from user",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /api/admin/roles
   * Lista todas as roles disponíveis
   */
  app.get("/roles", async (req: Request, res: Response) => {
    try {
      const allRoles = await db.select().from(roles);
      res.json(allRoles);
    } catch (error) {
      console.error("Error fetching roles:", error);
      res.status(500).json({
        error: "Failed to fetch roles",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });
}
