import type { Router } from "express";
import { z } from "zod";

// ✅ PRODUCTION-READY: Link Capture Jobs Routes
// Handles crawling job lifecycle: list, get, pause, resume, cancel

const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

function validateParams<T extends z.ZodType>(
  schema: T,
  req: any,
  res: any
): z.infer<T> | null {
  const result = schema.safeParse(req.params);
  if (!result.success) {
    res.status(400).json({
      error: "Invalid request parameters",
      details: result.error.errors,
    });
    return null;
  }
  return result.data;
}

export function registerJobsRoutes(router: Router) {
  // GET /jobs - List all crawling jobs (most recent first)
  router.get("/jobs", async (req, res) => {
    try {
      const { linkCaptureJobs } = await import("@shared/schema");
      const { db } = await import("../db");
      const { desc } = await import("drizzle-orm");
      
      const jobs = await db
        .select()
        .from(linkCaptureJobs)
        .orderBy(desc(linkCaptureJobs.createdAt))
        .limit(50);
      
      res.json(jobs);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /jobs/:id - Get specific job by ID
  router.get("/jobs/:id", async (req, res) => {
    try {
      const params = validateParams(idParamSchema, req, res);
      if (!params) return;
      
      const { id } = params;
      
      const { linkCaptureJobs } = await import("@shared/schema");
      const { db } = await import("../db");
      const { eq } = await import("drizzle-orm");
      
      const [job] = await db
        .select()
        .from(linkCaptureJobs)
        .where(eq(linkCaptureJobs.id, id))
        .limit(1);
      
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }
      
      res.json(job);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // PATCH /jobs/:id - Control job (pause, resume, cancel)
  // ✅ SECURITY: Protected by adminSubRouter's csrfProtection + requireAdmin
  router.patch("/jobs/:id", async (req, res) => {
    try {
      const params = validateParams(idParamSchema, req, res);
      if (!params) return;
      
      const { id: jobId } = params;
      const { action } = req.body;
      
      // ✅ SECURITY: Validate action parameter
      if (!action || !["pause", "resume", "cancel"].includes(action)) {
        return res.status(400).json({ 
          error: "Invalid action. Must be pause, resume, or cancel" 
        });
      }
      
      const { linkCaptureJobs } = await import("@shared/schema");
      const { db } = await import("../db");
      const { eq } = await import("drizzle-orm");
      
      const updates: any = {};
      
      if (action === "pause") {
        updates.status = "paused";
      } else if (action === "resume") {
        updates.status = "running";
      } else if (action === "cancel") {
        updates.status = "cancelled";
        updates.completedAt = new Date();
      }
      
      const [updatedJob] = await db
        .update(linkCaptureJobs)
        .set(updates)
        .where(eq(linkCaptureJobs.id, jobId))
        .returning();
      
      res.json(updatedJob);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
}
