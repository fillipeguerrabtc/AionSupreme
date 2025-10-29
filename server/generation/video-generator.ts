/**
 * Professional Video Generation Service
 * 
 * Implements GPU-backed video generation with multiple open-source backends:
 * 1. Open-Sora 1.2 (primary) - High-quality text-to-video
 * 2. AnimateDiff + Stable Video Diffusion (secondary) - Animated sequences
 * 3. ModelScope + Deformable Attention (tertiary) - Fallback
 * 
 * Architecture: Async job queue → GPU worker → Webhook callback
 * 
 * GPU Workers can be deployed on:
 * - RunPod (https://runpod.io) - Serverless GPU inference
 * - Modal (https://modal.com) - GPU container hosting
 * - Self-hosted with NVIDIA GPU
 */

import { storage } from "../storage";
import { imageGenerator } from "./image-generator";
import type { InsertVideoJob, InsertVideoAsset } from "@shared/schema";
import axios from "axios";
import crypto from "crypto";
import path from "path";
import fs from "fs/promises";

export interface VideoGenerationParams {
  prompt: string;
  duration?: number; // seconds (30, 60, 120, etc.)
  fps?: number; // 24, 30, 60
  resolution?: "720p" | "1080p" | "4k";
  style?: "realistic" | "animated" | "cinematic" | "documentary";
  scenes?: number; // multi-shot stitching
  audio?: boolean; // include narration/music
  voiceId?: string; // TTS voice selection
  model?: "open-sora" | "animatediff" | "modelscope" | "auto";
  tenantId: number;
  conversationId?: number;
}

export interface VideoGenerationResult {
  jobId: number;
  status: "pending" | "processing" | "completed" | "failed";
  progress: number; // 0-100
  currentStep?: string;
  videoUrl?: string;
  estimatedCompletionTime?: Date;
  error?: string;
}

export class VideoGenerator {
  private workerUrl: string | null;
  private storageDir: string;

  constructor() {
    // GPU Worker URL (set via environment variable)
    // Example: https://your-worker.modal.run/generate-video
    this.workerUrl = process.env.VIDEO_WORKER_URL || null;
    this.storageDir = path.join(process.cwd(), "server", "generated", "videos");
  }

  /**
   * Submit video generation job (async)
   * Returns immediately with job ID
   */
  async submitVideoJob(params: VideoGenerationParams): Promise<VideoGenerationResult> {
    const {
      prompt,
      duration = 30,
      fps = 24,
      resolution = "1080p",
      style = "realistic",
      scenes = 1,
      audio = false,
      voiceId,
      model = "auto",
      tenantId,
      conversationId,
    } = params;

    console.log(`[VideoGen] Creating video job: "${prompt.slice(0, 60)}..."`);

    // Create job in database
    const job = await storage.createVideoJob({
      tenantId,
      conversationId: conversationId || null,
      prompt,
      parameters: {
        duration,
        fps,
        resolution,
        style,
        scenes,
        audio,
        voiceId,
        model,
      },
      status: "pending",
      progress: 0,
      currentStep: "queued",
      workerId: null,
      workerUrl: this.workerUrl,
      errorMessage: null,
      generationLogs: [],
      startedAt: null,
      completedAt: null,
      estimatedCompletionAt: this.estimateCompletionTime(duration, resolution),
    });

    console.log(`[VideoGen] Job created: #${job.id}`);

    // If worker is available, dispatch job immediately
    if (this.workerUrl) {
      this.dispatchToWorker(job.id).catch((error) => {
        console.error(`[VideoGen] Worker dispatch failed:`, error.message);
        // Will be retried by job poller
      });
    } else {
      // No worker configured - fail immediately
      console.error(`[VideoGen] No GPU worker configured (VIDEO_WORKER_URL not set)`);
      await storage.updateVideoJob(job.id, {
        status: "failed",
        errorMessage: `GPU worker not configured. Professional video generation requires Open-Sora/AnimateDiff GPU workers. Set VIDEO_WORKER_URL environment variable or see GPU_WORKER_SETUP.md for deployment instructions.`,
        currentStep: "failed",
      });
    }

    return {
      jobId: job.id,
      status: job.status as any,
      progress: job.progress,
      currentStep: job.currentStep || undefined,
      estimatedCompletionTime: job.estimatedCompletionAt || undefined,
    };
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId: number): Promise<VideoGenerationResult> {
    const job = await storage.getVideoJob(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    let videoUrl: string | undefined;
    if (job.status === "completed") {
      const asset = await storage.getVideoAssetByJobId(jobId);
      if (asset) {
        videoUrl = `/api/videos/${asset.id}`;
      }
    }

    return {
      jobId: job.id,
      status: job.status as any,
      progress: job.progress,
      currentStep: job.currentStep || undefined,
      videoUrl,
      estimatedCompletionTime: job.estimatedCompletionAt || undefined,
      error: job.errorMessage || undefined,
    };
  }

  /**
   * Dispatch job to GPU worker
   * Worker should process and call webhook when done
   */
  private async dispatchToWorker(jobId: number): Promise<void> {
    if (!this.workerUrl) {
      throw new Error("No worker URL configured");
    }

    const job = await storage.getVideoJob(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    // Update job status
    await storage.updateVideoJob(jobId, {
      status: "processing",
      startedAt: new Date(),
      currentStep: "dispatching",
    });

    try {
      // Send job to worker
      const response = await axios.post(
        this.workerUrl,
        {
          job_id: jobId,
          prompt: job.prompt,
          parameters: job.parameters,
          callback_url: `${process.env.REPLIT_DOMAINS || 'http://localhost:5000'}/api/videos/webhook`,
        },
        {
          timeout: 10000, // 10s timeout for dispatch
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      console.log(`[VideoGen] Job #${jobId} dispatched to worker:`, response.data);

      // Update with worker info
      await storage.updateVideoJob(jobId, {
        workerId: response.data.worker_id || "unknown",
        currentStep: "generating",
      });
    } catch (error: any) {
      console.error(`[VideoGen] Worker dispatch failed:`, error.message);
      
      // Mark job as failed - NO DALL-E FALLBACK
      await storage.updateVideoJob(jobId, {
        status: "failed",
        errorMessage: `GPU worker unavailable. Professional video generation requires a GPU worker (Open-Sora/AnimateDiff). See GPU_WORKER_SETUP.md for deployment instructions.`,
        currentStep: "failed",
      });
      
      throw new Error("GPU worker required for video generation");
    }
  }

  /**
   * REMOVED: Local DALL-E fallback
   * 
   * Professional video generation REQUIRES GPU workers with open-source models:
   * - Open-Sora 1.2 (primary)
   * - AnimateDiff + Stable Video Diffusion (secondary)
   * - ModelScope (tertiary)
   * 
   * To enable video generation, deploy a GPU worker:
   * See GPU_WORKER_SETUP.md for complete instructions
   * 
   * This enforces the user's requirement: "Maximum open-source and free tools"
   */

  /**
   * Estimate completion time based on video parameters
   */
  private estimateCompletionTime(duration: number, resolution: string): Date {
    // Rough estimates:
    // 720p: ~2 seconds per second of video
    // 1080p: ~4 seconds per second of video
    // 4k: ~10 seconds per second of video
    const multipliers: Record<string, number> = {
      "720p": 2,
      "1080p": 4,
      "4k": 10,
    };
    const multiplier = multipliers[resolution] || 4;
    const estimatedSeconds = duration * multiplier + 30; // +30s for overhead

    return new Date(Date.now() + estimatedSeconds * 1000);
  }
}

export const videoGenerator = new VideoGenerator();
