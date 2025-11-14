/**
 * Audio Converter - Enterprise-grade FFmpeg wrapper
 * 
 * Converts video containers (video/webm, video/mp4) to pure audio formats
 * for Whisper API compatibility.
 * 
 * FEATURES:
 * - FFmpeg conversion: video/* → WAV (16kHz mono PCM)
 * - Timeout protection (15s max)
 * - File size limits (100MB max)
 * - Structured logging with trace IDs
 * - Telemetry (success/failure counters, latency)
 * - Automatic temp file cleanup
 * - Error handling with detailed messages
 */

import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { fileTypeFromBuffer } from "file-type";

export interface AudioConversionResult {
  success: boolean;
  outputPath?: string;
  error?: string;
  cleanupPaths: string[]; // ✅ ALL files to cleanup (partial outputs, temp files)
  telemetry: {
    originalMime: string;
    convertedMime?: string;
    originalSizeBytes: number;
    convertedSizeBytes?: number;
    conversionLatencyMs: number;
    requiresConversion: boolean;
    ffmpegExitCode?: number;
  };
}

/**
 * Convert audio/video file to Whisper-compatible WAV format
 * 
 * Whisper API accepts: flac, m4a, mp3, mp4, mpeg, mpga, oga, ogg, wav, webm
 * But MediaRecorder creates video/webm and video/mp4 containers which Whisper rejects.
 * 
 * This function extracts pure audio from containers using FFmpeg:
 * - Strips video tracks (-vn)
 * - Converts to PCM 16-bit mono 16kHz WAV
 * - Timeout protection (15s)
 * - File size limit (100MB)
 * 
 * @param inputPath Path to audio/video file
 * @param requiresConversion Flag from validator (skip MIME re-detection if provided)
 * @param detectedMime MIME type from validator (avoid duplicate detection)
 * @param traceId Trace ID for structured logging
 */
export async function convertToWhisperFormat(
  inputPath: string,
  requiresConversion?: boolean,
  detectedMime?: string,
  traceId?: string
): Promise<AudioConversionResult> {
  const startTime = Date.now();
  const logContext = traceId ? `[AudioConverter:${traceId}]` : "[AudioConverter]";
  
  try {
    // 1. Get file size
    const stats = await fs.stat(inputPath);
    const fileSize = stats.size;
    
    // Check size limit (100MB)
    const MAX_SIZE = 100 * 1024 * 1024;
    if (fileSize > MAX_SIZE) {
      console.error(`${logContext} File too large: ${(fileSize / 1024 / 1024).toFixed(2)}MB (max 100MB)`);
      return {
        success: false,
        error: `File too large: ${(fileSize / 1024 / 1024).toFixed(2)}MB. Maximum: 100MB`,
        cleanupPaths: [], // No files generated yet
        telemetry: {
          originalMime: detectedMime || "unknown",
          originalSizeBytes: fileSize,
          conversionLatencyMs: Date.now() - startTime,
          requiresConversion: requiresConversion ?? true,
        },
      };
    }
    
    // 2. Use validator's MIME if provided, otherwise detect
    let originalMime = detectedMime;
    if (!originalMime) {
      const buffer = Buffer.alloc(Math.min(4100, fileSize));
      const fd = await fs.open(inputPath, 'r');
      await fd.read(buffer, 0, buffer.length, 0);
      await fd.close();
      
      const fileType = await fileTypeFromBuffer(buffer);
      originalMime = fileType?.mime || "unknown";
    }
    
    console.log(`${logContext} Input file: ${path.basename(inputPath)}, MIME: ${originalMime}, Size: ${(fileSize / 1024).toFixed(2)}KB`);
    
    // 3. Use validator's flag if provided, otherwise detect
    const needsConversion = requiresConversion ?? (originalMime.startsWith("video/"));
    
    if (!needsConversion) {
      // File is already pure audio, return as-is
      console.log(`${logContext} File already in audio format, no conversion needed`);
      return {
        success: true,
        outputPath: inputPath,
        cleanupPaths: [], // No conversion = no new files generated
        telemetry: {
          originalMime,
          convertedMime: originalMime,
          originalSizeBytes: fileSize,
          convertedSizeBytes: fileSize,
          conversionLatencyMs: Date.now() - startTime,
          requiresConversion: false,
        },
      };
    }
    
    // 3. Prepare output path
    const tempDir = os.tmpdir();
    const outputFilename = `whisper_${Date.now()}_${Math.random().toString(36).substring(7)}.wav`;
    const outputPath = path.join(tempDir, outputFilename);
    
    console.log(`${logContext} Converting video container to WAV audio...`);
    
    // 4. Run FFmpeg conversion with timeout
    const conversionResult = await runFFmpegConversion(inputPath, outputPath, 15000, logContext);
    
    if (!conversionResult.success) {
      // ✅ Return cleanup paths INCLUDING partial output (FFmpeg may have created it)
      return {
        success: false,
        error: conversionResult.error,
        cleanupPaths: [outputPath], // Include partial/failed WAV for cleanup
        telemetry: {
          originalMime,
          originalSizeBytes: fileSize,
          conversionLatencyMs: Date.now() - startTime,
          requiresConversion: true,
          ffmpegExitCode: conversionResult.exitCode,
        },
      };
    }
    
    // 5. Verify output file
    let outputStats;
    try {
      outputStats = await fs.stat(outputPath);
    } catch (statError: any) {
      // ✅ Output file doesn't exist after conversion (FFmpeg reported success but no file)
      console.error(`${logContext} Output file not found after conversion:`, statError);
      
      return {
        success: false,
        error: `Conversion output file not found: ${statError.message}`,
        cleanupPaths: [outputPath], // Include in cleanup anyway (defensive)
        telemetry: {
          originalMime,
          originalSizeBytes: fileSize,
          conversionLatencyMs: Date.now() - startTime,
          requiresConversion: true,
          ffmpegExitCode: conversionResult.exitCode,
        },
      };
    }
    
    const outputSize = outputStats.size;
    
    console.log(`${logContext} Conversion successful: ${(outputSize / 1024).toFixed(2)}KB WAV, latency: ${Date.now() - startTime}ms`);
    
    return {
      success: true,
      outputPath,
      cleanupPaths: [outputPath], // ✅ Converted WAV needs cleanup after use
      telemetry: {
        originalMime,
        convertedMime: "audio/wav",
        originalSizeBytes: fileSize,
        convertedSizeBytes: outputSize,
        conversionLatencyMs: Date.now() - startTime,
        requiresConversion: true,
        ffmpegExitCode: 0,
      },
    };
    
  } catch (error: any) {
    const latency = Date.now() - startTime;
    console.error(`${logContext} Conversion failed:`, error);
    return {
      success: false,
      error: `Audio conversion failed: ${error.message}`,
      cleanupPaths: [], // Exception before file creation
      telemetry: {
        originalMime: "unknown",
        originalSizeBytes: 0,
        conversionLatencyMs: latency,
        requiresConversion: true,
      },
    };
  }
}

/**
 * Run FFmpeg command with timeout protection
 * 
 * Command: ffmpeg -i <input> -vn -acodec pcm_s16le -ar 16000 -ac 1 <output>
 * - -vn: Strip video tracks
 * - -acodec pcm_s16le: PCM 16-bit signed little-endian
 * - -ar 16000: 16kHz sample rate (Whisper optimal)
 * - -ac 1: Mono (1 channel)
 */
async function runFFmpegConversion(
  inputPath: string,
  outputPath: string,
  timeoutMs: number,
  logContext: string
): Promise<{ success: boolean; error?: string; exitCode?: number }> {
  return new Promise((resolve) => {
    const args = [
      "-i", inputPath,
      "-vn",                    // Strip video
      "-acodec", "pcm_s16le",   // PCM 16-bit
      "-ar", "16000",           // 16kHz (Whisper optimal)
      "-ac", "1",               // Mono
      "-y",                     // Overwrite output
      outputPath,
    ];
    
    console.log(`${logContext} FFmpeg command: ffmpeg ${args.join(" ")}`);
    
    const ffmpeg = spawn("ffmpeg", args);
    let stderr = "";
    let timedOut = false;
    
    // Timeout protection
    const timeout = setTimeout(() => {
      timedOut = true;
      ffmpeg.kill("SIGTERM");
      console.error(`${logContext} FFmpeg timeout after ${timeoutMs}ms`);
    }, timeoutMs);
    
    // Capture stderr (FFmpeg outputs progress to stderr)
    ffmpeg.stderr.on("data", (data) => {
      stderr += data.toString();
    });
    
    ffmpeg.on("close", (code) => {
      clearTimeout(timeout);
      
      if (timedOut) {
        resolve({
          success: false,
          error: `Conversion timeout after ${timeoutMs}ms`,
          exitCode: -1,
        });
        return;
      }
      
      if (code !== 0) {
        console.error(`${logContext} FFmpeg failed with exit code ${code}:`, stderr);
        resolve({
          success: false,
          error: `FFmpeg conversion failed (exit code ${code})`,
          exitCode: code || undefined,
        });
        return;
      }
      
      console.log(`${logContext} FFmpeg conversion successful`);
      resolve({ success: true, exitCode: 0 });
    });
    
    ffmpeg.on("error", (err) => {
      clearTimeout(timeout);
      console.error(`${logContext} FFmpeg process error:`, err);
      resolve({
        success: false,
        error: `FFmpeg process error: ${err.message}`,
      });
    });
  });
}

/**
 * Clean up temporary audio file
 */
export async function cleanupTempAudioFile(filePath: string | undefined): Promise<void> {
  if (!filePath) return;
  
  try {
    await fs.unlink(filePath);
    console.log(`[AudioConverter] Cleaned up temp file: ${path.basename(filePath)}`);
  } catch (error: any) {
    // Log but don't throw - cleanup failure shouldn't break the main flow
    console.warn(`[AudioConverter] Failed to cleanup temp file ${filePath}:`, error.message);
  }
}
