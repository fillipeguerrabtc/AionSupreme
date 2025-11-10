/**
 * ALERT API ROUTES
 * =================
 * 
 * Endpoints para gerenciar alertas do sistema
 */

import type { Router } from 'express';
import { alertService } from '../services/alert-service';
import { requireAdmin } from '../middleware/auth';
import { z } from 'zod';

const severitySchema = z.enum(['info', 'warning', 'critical', 'emergency']);
const limitSchema = z.coerce.number().int().min(1).max(1000);

export function registerAlertRoutes(app: Router) {
  /**
   * GET /alerts/recent
   * Get recent alerts with optional filtering
   */
  app.get('/alerts/recent', requireAdmin, async (req, res) => {
    try {
      // Validate inputs
      const limitResult = limitSchema.safeParse(req.query.limit || 100);
      const limit = limitResult.success ? limitResult.data : 100;
      
      const severityResult = req.query.severity ? severitySchema.safeParse(req.query.severity) : null;
      const severity = severityResult?.success ? severityResult.data : undefined;
      
      const alerts = alertService.getRecentAlerts(limit, severity);
      
      res.json({
        alerts,
        total: alerts.length,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /alerts/test
   * Test alert configuration (send test alert)
   */
  app.post('/alerts/test', requireAdmin, async (req, res) => {
    try {
      // Validate severity input
      const severityResult = req.body.severity ? severitySchema.safeParse(req.body.severity) : null;
      const severity = severityResult?.success ? severityResult.data : 'info';
      
      const { title, message } = req.body;
      
      await alertService.sendAlert({
        severity,
        title: title || 'Test Alert',
        message: message || 'Testing alert webhook configuration',
        context: {
          test: true,
          requestedBy: 'admin-test',
        },
      });
      
      res.json({
        success: true,
        message: 'Test alert sent successfully',
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * DELETE /alerts/history
   * Clear alert history
   */
  app.delete('/alerts/history', requireAdmin, async (req, res) => {
    try {
      alertService.clearHistory();
      
      res.json({
        success: true,
        message: 'Alert history cleared',
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
}
