"""
AION - Stable Diffusion XL GPU Worker
Production-grade FastAPI server for text2img and img2img generation
Integrates with AION GPU Pool System for automatic registration and load balancing
"""

import os
import io
import time
import base64
import hashlib
import logging
from typing import Optional, List
from datetime import datetime
from pathlib import Path

import torch
import requests
from PIL import Image
from fastapi import FastAPI, HTTPException, File, UploadFile, Form
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from diffusers import StableDiffusionXLPipeline, StableDiffusionXLImg2ImgPipeline
from diffusers import DPMSolverMultistepScheduler

# Logging configuration
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Environment configuration
AION_BACKEND_URL = os.getenv("AION_BACKEND_URL", "http://localhost:5000")
WORKER_ID = os.getenv("WORKER_ID", f"sd-xl-{hashlib.md5(str(time.time()).encode()).hexdigest()[:8]}")
GPU_TYPE = os.getenv("GPU_TYPE", "T4")  # T4, P100, V100, A100
PROVIDER = os.getenv("PROVIDER", "kaggle")  # kaggle, modal, colab
OUTPUT_DIR = Path(os.getenv("OUTPUT_DIR", "/workspace/outputs"))

# Create output directory
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# FastAPI app
app = FastAPI(
    title="AION SD-XL Worker",
    description="Stable Diffusion XL GPU Worker for AION AI System",
    version="1.0.0"
)

# Global state
pipeline_text2img: Optional[StableDiffusionXLPipeline] = None
pipeline_img2img: Optional[StableDiffusionXLImg2ImgPipeline] = None
is_ready = False
last_heartbeat = time.time()


class Text2ImgRequest(BaseModel):
    prompt: str = Field(..., description="Text prompt for image generation")
    negative_prompt: Optional[str] = Field(None, description="Negative prompt")
    width: int = Field(1024, ge=512, le=2048, description="Image width")
    height: int = Field(1024, ge=512, le=2048, description="Image height")
    num_inference_steps: int = Field(30, ge=10, le=100, description="Number of denoising steps")
    guidance_scale: float = Field(7.5, ge=1.0, le=20.0, description="Guidance scale")
    seed: Optional[int] = Field(None, description="Random seed for reproducibility")
    num_images: int = Field(1, ge=1, le=4, description="Number of images to generate")


class Img2ImgRequest(BaseModel):
    prompt: str = Field(..., description="Text prompt for image generation")
    negative_prompt: Optional[str] = Field(None, description="Negative prompt")
    strength: float = Field(0.8, ge=0.1, le=1.0, description="Transformation strength")
    num_inference_steps: int = Field(30, ge=10, le=100, description="Number of denoising steps")
    guidance_scale: float = Field(7.5, ge=1.0, le=20.0, description="Guidance scale")
    seed: Optional[int] = Field(None, description="Random seed")


class HealthResponse(BaseModel):
    status: str
    worker_id: str
    gpu_type: str
    provider: str
    model_loaded: bool
    last_heartbeat: float
    uptime: float
    gpu_memory_allocated: Optional[float] = None
    gpu_memory_reserved: Optional[float] = None


@app.on_event("startup")
async def startup_event():
    """Load models on startup and register with AION backend"""
    global pipeline_text2img, pipeline_img2img, is_ready
    
    logger.info("🚀 Starting AION SD-XL Worker...")
    logger.info(f"Worker ID: {WORKER_ID}")
    logger.info(f"GPU Type: {GPU_TYPE}")
    logger.info(f"Provider: {PROVIDER}")
    logger.info(f"Backend URL: {AION_BACKEND_URL}")
    
    try:
        # Check CUDA availability
        if not torch.cuda.is_available():
            logger.warning("⚠️ CUDA not available - using CPU (very slow)")
            device = "cpu"
        else:
            device = "cuda"
            logger.info(f"✅ CUDA available - GPU: {torch.cuda.get_device_name(0)}")
        
        # Load text2img pipeline
        logger.info("📦 Loading Stable Diffusion XL text2img pipeline...")
        pipeline_text2img = StableDiffusionXLPipeline.from_pretrained(
            "stabilityai/stable-diffusion-xl-base-1.0",
            torch_dtype=torch.float16 if device == "cuda" else torch.float32,
            use_safetensors=True,
            variant="fp16" if device == "cuda" else None
        )
        pipeline_text2img.scheduler = DPMSolverMultistepScheduler.from_config(
            pipeline_text2img.scheduler.config
        )
        pipeline_text2img = pipeline_text2img.to(device)
        
        if device == "cuda":
            pipeline_text2img.enable_model_cpu_offload()
            pipeline_text2img.enable_vae_slicing()
        
        logger.info("✅ Text2img pipeline loaded")
        
        # Load img2img pipeline (reuses components from text2img)
        logger.info("📦 Loading img2img pipeline...")
        pipeline_img2img = StableDiffusionXLImg2ImgPipeline(
            vae=pipeline_text2img.vae,
            text_encoder=pipeline_text2img.text_encoder,
            text_encoder_2=pipeline_text2img.text_encoder_2,
            tokenizer=pipeline_text2img.tokenizer,
            tokenizer_2=pipeline_text2img.tokenizer_2,
            unet=pipeline_text2img.unet,
            scheduler=pipeline_text2img.scheduler,
        )
        pipeline_img2img = pipeline_img2img.to(device)
        logger.info("✅ Img2img pipeline loaded")
        
        is_ready = True
        logger.info("✅ All models loaded successfully")
        
        # Register with AION backend
        await register_worker()
        
    except Exception as e:
        logger.error(f"❌ Failed to load models: {e}")
        raise


async def register_worker():
    """Register this worker with AION GPU Pool"""
    try:
        payload = {
            "workerId": WORKER_ID,
            "gpuType": GPU_TYPE,
            "provider": PROVIDER,
            "capabilities": ["text2img", "img2img", "lora"],
            "status": "ready",
            "metadata": {
                "model": "stable-diffusion-xl-base-1.0",
                "device": "cuda" if torch.cuda.is_available() else "cpu"
            }
        }
        
        response = requests.post(
            f"{AION_BACKEND_URL}/api/gpu-pool/workers/register",
            json=payload,
            timeout=10
        )
        
        if response.status_code == 200:
            logger.info(f"✅ Worker registered with AION backend: {WORKER_ID}")
        else:
            logger.warning(f"⚠️ Failed to register worker: {response.status_code}")
            
    except Exception as e:
        logger.error(f"❌ Worker registration failed: {e}")


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint for GPU Pool monitoring"""
    global last_heartbeat
    last_heartbeat = time.time()
    
    gpu_mem_allocated = None
    gpu_mem_reserved = None
    
    if torch.cuda.is_available():
        gpu_mem_allocated = torch.cuda.memory_allocated() / 1024**3  # GB
        gpu_mem_reserved = torch.cuda.memory_reserved() / 1024**3  # GB
    
    return HealthResponse(
        status="ready" if is_ready else "loading",
        worker_id=WORKER_ID,
        gpu_type=GPU_TYPE,
        provider=PROVIDER,
        model_loaded=is_ready,
        last_heartbeat=last_heartbeat,
        uptime=time.time() - last_heartbeat,
        gpu_memory_allocated=gpu_mem_allocated,
        gpu_memory_reserved=gpu_mem_reserved
    )


@app.post("/generate/text2img")
async def generate_text2img(request: Text2ImgRequest):
    """Generate image from text prompt"""
    if not is_ready or pipeline_text2img is None:
        raise HTTPException(status_code=503, detail="Model not loaded yet")
    
    try:
        logger.info(f"🎨 Generating text2img: {request.prompt[:50]}...")
        
        # Set random seed if provided
        generator = None
        if request.seed is not None:
            generator = torch.Generator(device="cuda" if torch.cuda.is_available() else "cpu")
            generator.manual_seed(request.seed)
        
        # Generate images
        start_time = time.time()
        output = pipeline_text2img(
            prompt=request.prompt,
            negative_prompt=request.negative_prompt,
            width=request.width,
            height=request.height,
            num_inference_steps=request.num_inference_steps,
            guidance_scale=request.guidance_scale,
            num_images_per_prompt=request.num_images,
            generator=generator
        )
        
        generation_time = time.time() - start_time
        logger.info(f"✅ Generated {len(output.images)} images in {generation_time:.2f}s")
        
        # Save images and encode to base64
        image_urls = []
        for idx, image in enumerate(output.images):
            # Save to disk
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"sd_xl_{timestamp}_{idx}.png"
            filepath = OUTPUT_DIR / filename
            image.save(filepath)
            
            # Convert to base64
            buffered = io.BytesIO()
            image.save(buffered, format="PNG")
            img_base64 = base64.b64encode(buffered.getvalue()).decode()
            
            image_urls.append({
                "filename": filename,
                "path": str(filepath),
                "base64": img_base64,
                "width": image.width,
                "height": image.height
            })
        
        return JSONResponse({
            "success": True,
            "images": image_urls,
            "generation_time": generation_time,
            "worker_id": WORKER_ID,
            "seed": request.seed
        })
        
    except Exception as e:
        logger.error(f"❌ Text2img generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/generate/img2img")
async def generate_img2img(
    prompt: str = Form(...),
    image: UploadFile = File(...),
    negative_prompt: Optional[str] = Form(None),
    strength: float = Form(0.8),
    num_inference_steps: int = Form(30),
    guidance_scale: float = Form(7.5),
    seed: Optional[int] = Form(None)
):
    """Generate image from image + text prompt"""
    if not is_ready or pipeline_img2img is None:
        raise HTTPException(status_code=503, detail="Model not loaded yet")
    
    try:
        logger.info(f"🎨 Generating img2img: {prompt[:50]}...")
        
        # Load input image
        image_data = await image.read()
        init_image = Image.open(io.BytesIO(image_data)).convert("RGB")
        
        # Set random seed if provided
        generator = None
        if seed is not None:
            generator = torch.Generator(device="cuda" if torch.cuda.is_available() else "cpu")
            generator.manual_seed(seed)
        
        # Generate image
        start_time = time.time()
        output = pipeline_img2img(
            prompt=prompt,
            image=init_image,
            negative_prompt=negative_prompt,
            strength=strength,
            num_inference_steps=num_inference_steps,
            guidance_scale=guidance_scale,
            generator=generator
        )
        
        generation_time = time.time() - start_time
        logger.info(f"✅ Generated img2img in {generation_time:.2f}s")
        
        # Save image
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"sd_xl_img2img_{timestamp}.png"
        filepath = OUTPUT_DIR / filename
        output.images[0].save(filepath)
        
        # Convert to base64
        buffered = io.BytesIO()
        output.images[0].save(buffered, format="PNG")
        img_base64 = base64.b64encode(buffered.getvalue()).decode()
        
        return JSONResponse({
            "success": True,
            "image": {
                "filename": filename,
                "path": str(filepath),
                "base64": img_base64,
                "width": output.images[0].width,
                "height": output.images[0].height
            },
            "generation_time": generation_time,
            "worker_id": WORKER_ID,
            "seed": seed
        })
        
    except Exception as e:
        logger.error(f"❌ Img2img generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/heartbeat")
async def send_heartbeat():
    """Manual heartbeat endpoint (called by AION backend)"""
    global last_heartbeat
    last_heartbeat = time.time()
    
    return {
        "status": "alive",
        "worker_id": WORKER_ID,
        "timestamp": last_heartbeat,
        "is_ready": is_ready
    }


if __name__ == "__main__":
    import uvicorn
    
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=port,
        log_level="info"
    )
