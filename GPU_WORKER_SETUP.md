# GPU Worker Setup Guide for Professional Video Generation

## 🎬 Overview

AION uses **GPU-backed workers** to generate professional, cinema-quality videos using open-source models:
- **Open-Sora 1.2** (primary) - High-quality text-to-video
- **AnimateDiff + Stable Video Diffusion** (secondary)
- **ModelScope** (tertiary fallback)

## 📋 Prerequisites

- NVIDIA GPU with ≥16GB VRAM (24GB recommended for 4K)
- CUDA 11.8+ and cuDNN
- Docker (recommended) or Python 3.10+
- RunPod/Modal account (for cloud deployment) OR self-hosted GPU

---

## 🚀 Quick Start: Deploy Worker on RunPod

### 1. Create RunPod Account
Visit https://runpod.io and create an account. Add GPU credits (~$10 for testing).

### 2. Deploy Worker Template

```bash
# Clone worker repository
git clone https://github.com/your-org/aion-video-worker.git
cd aion-video-worker

# Build Docker image
docker build -t aion-video-worker:latest .

# Push to Docker Hub (or RunPod container registry)
docker tag aion-video-worker:latest your-dockerhub/aion-video-worker:latest
docker push your-dockerhub/aion-video-worker:latest
```

### 3. Configure RunPod Pod

1. Go to RunPod Console → Pods → Deploy New Pod
2. Select **GPU**: RTX 4090 or A6000 (48GB VRAM recommended)
3. Container Image: `your-dockerhub/aion-video-worker:latest`
4. Container Disk: 50GB minimum
5. Volume: 100GB for model weights
6. Expose Port: `8000` (HTTP)
7. Environment Variables:
   ```
   MODEL=open-sora
   WORKERS=1
   WEBHOOK_SECRET=your-secret-key
   ```

### 4. Connect AION to Worker

In your Replit project, add environment variable:

```bash
VIDEO_WORKER_URL=https://your-pod-id-8000.proxy.runpod.net/generate
```

Restart your AION server.

---

## 🏗️ Worker Architecture

### Input (POST /generate)
```json
{
  "job_id": 123,
  "prompt": "A majestic dragon flying over mountains at sunset",
  "parameters": {
    "duration": 30,
    "fps": 24,
    "resolution": "1080p",
    "style": "cinematic",
    "scenes": 3,
    "audio": true,
    "model": "open-sora"
  },
  "callback_url": "https://your-aion.replit.app/api/videos/webhook"
}
```

### Processing Pipeline
1. **Scene Planning** - Break prompt into multi-shot sequences
2. **Video Generation** - Open-Sora/AnimateDiff synthesis
3. **Stitching** - FFmpeg scene concatenation
4. **Upscaling** - Real-ESRGAN temporal upscaling
5. **Frame Interpolation** - RIFE for smooth motion
6. **Audio Synthesis** - ElevenLabs/Bark TTS + music
7. **Audio Sync** - Align narration with video

### Output (POST callback_url/webhook)
```json
{
  "job_id": 123,
  "status": "completed",
  "video_url": "https://storage.runpod.io/videos/abc123.mp4",
  "thumbnail_url": "https://storage.runpod.io/thumbs/abc123.jpg",
  "duration": 30.2,
  "resolution": "1920x1080",
  "fps": 24,
  "size_bytes": 45678901,
  "metadata": {
    "scenes": 3,
    "transitions": ["fade", "dissolve"],
    "quality_score": 92.5
  }
}
```

---

## 🐳 Docker Worker Implementation

### Dockerfile
```dockerfile
FROM nvidia/cuda:11.8.0-cudnn8-runtime-ubuntu22.04

# Install system dependencies
RUN apt-get update && apt-get install -y \
    python3.10 python3-pip git ffmpeg \
    libsm6 libxext6 libxrender-dev

# Install Python packages
RUN pip3 install torch torchvision --index-url https://download.pytorch.org/whl/cu118
RUN pip3 install diffusers transformers accelerate xformers
RUN pip3 install opencv-python pillow numpy scipy
RUN pip3 install fastapi uvicorn httpx

# Clone models
RUN git clone https://huggingface.co/hpcai-tech/Open-Sora /models/open-sora
RUN git clone https://huggingface.co/guoyww/animatediff /models/animatediff

# Copy worker code
WORKDIR /app
COPY worker.py .
COPY requirements.txt .
RUN pip3 install -r requirements.txt

EXPOSE 8000
CMD ["uvicorn", "worker:app", "--host", "0.0.0.0", "--port", "8000"]
```

### worker.py (Example)
```python
from fastapi import FastAPI, BackgroundTasks
from pydantic import BaseModel
import httpx
import asyncio
from typing import Optional

app = FastAPI()

class VideoRequest(BaseModel):
    job_id: int
    prompt: str
    parameters: dict
    callback_url: str

@app.post("/generate")
async def generate_video(request: VideoRequest, background_tasks: BackgroundTasks):
    # Start generation in background
    background_tasks.add_task(process_video, request)
    return {"status": "processing", "job_id": request.job_id}

async def process_video(request: VideoRequest):
    try:
        # 1. Load model (Open-Sora)
        from opensora.models import OpenSoraModel
        model = OpenSoraModel.from_pretrained("/models/open-sora")
        
        # 2. Generate video
        video_path = await model.generate(
            prompt=request.prompt,
            duration=request.parameters.get("duration", 30),
            fps=request.parameters.get("fps", 24),
            resolution=request.parameters.get("resolution", "1080p"),
        )
        
        # 3. Upload to storage
        video_url = await upload_to_storage(video_path)
        
        # 4. Callback to AION
        async with httpx.AsyncClient() as client:
            await client.post(
                request.callback_url,
                json={
                    "job_id": request.job_id,
                    "status": "completed",
                    "video_url": video_url,
                    "duration": 30.0,
                    "resolution": "1920x1080",
                    "fps": 24,
                }
            )
    except Exception as e:
        # Callback with error
        async with httpx.AsyncClient() as client:
            await client.post(
                request.callback_url,
                json={
                    "job_id": request.job_id,
                    "status": "failed",
                    "error": str(e),
                }
            )

async def upload_to_storage(video_path: str) -> str:
    # Upload to S3/R2/RunPod Storage
    # Return public URL
    pass
```

---

## 🖥️ Self-Hosted Setup (Advanced)

### Requirements
- Ubuntu 22.04 LTS
- NVIDIA GPU (RTX 3090, 4090, A6000, etc.)
- 32GB+ RAM
- 500GB+ SSD

### Installation
```bash
# Install CUDA
wget https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2204/x86_64/cuda-keyring_1.0-1_all.deb
sudo dpkg -i cuda-keyring_1.0-1_all.deb
sudo apt-get update
sudo apt-get install cuda-11-8

# Install cuDNN
# Download from NVIDIA website
sudo dpkg -i cudnn-local-repo-ubuntu2204-8.9.0.131_1.0-1_amd64.deb

# Install Python environment
sudo apt install python3.10 python3-pip python3-venv
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu118
pip install diffusers transformers accelerate xformers
pip install fastapi uvicorn httpx pillow opencv-python

# Download models
git lfs install
git clone https://huggingface.co/hpcai-tech/Open-Sora models/open-sora
git clone https://huggingface.co/guoyww/animatediff models/animatediff

# Run worker
uvicorn worker:app --host 0.0.0.0 --port 8000
```

### Expose with ngrok (for testing)
```bash
ngrok http 8000
# Use ngrok URL as VIDEO_WORKER_URL in AION
```

---

## 📊 Model Comparison

| Model | Quality | Speed | VRAM | Best For |
|-------|---------|-------|------|----------|
| **Open-Sora 1.2** | ⭐⭐⭐⭐⭐ | Medium | 24GB | Cinematic, realistic |
| **AnimateDiff** | ⭐⭐⭐⭐ | Fast | 16GB | Animated, stylized |
| **ModelScope** | ⭐⭐⭐ | Very Fast | 12GB | Quick drafts |

---

## 🔧 Troubleshooting

### Out of Memory (OOM)
- Reduce resolution: 4K → 1080p → 720p
- Reduce duration: 120s → 60s → 30s
- Enable model offloading: `model.enable_model_cpu_offload()`

### Slow Generation
- Use mixed precision: `torch.autocast("cuda")`
- Enable xformers: `model.enable_xformers_memory_efficient_attention()`
- Reduce FPS: 30 → 24 → 15

### Worker Not Reachable
- Check firewall rules (port 8000 open)
- Verify ngrok/RunPod proxy status
- Test with: `curl http://worker-url/health`

---

## 💡 Cost Estimates

### RunPod (Cloud GPU)
- RTX 4090: ~$0.40/hour
- A6000 (48GB): ~$0.80/hour
- 30s video generation: ~2-5 minutes = $0.01-0.05/video

### Self-Hosted
- RTX 4090: ~$1,600 one-time
- Electricity: ~$0.50/day (24/7)
- Break-even: ~3,200 videos

---

## 📚 Resources

- Open-Sora: https://github.com/hpcaitech/Open-Sora
- AnimateDiff: https://github.com/guoyww/AnimateDiff
- RunPod Docs: https://docs.runpod.io
- Modal Docs: https://modal.com/docs

---

## ✅ Next Steps

1. **Deploy Worker**: RunPod or self-hosted
2. **Set VIDEO_WORKER_URL**: Environment variable in AION
3. **Test**: POST /api/videos/generate with simple prompt
4. **Monitor**: Check /api/videos/jobs/:id for status
5. **Scale**: Add more workers for parallel processing
