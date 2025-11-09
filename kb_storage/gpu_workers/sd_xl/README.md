# AION Stable Diffusion XL Worker

Production-grade GPU worker for Stable Diffusion XL image generation, integrated with AION GPU Pool System.

## Features

- ✅ **Text-to-Image**: Generate images from text prompts
- ✅ **Image-to-Image**: Transform existing images with prompts
- ✅ **Auto-Registration**: Automatically registers with AION backend
- ✅ **Health Monitoring**: Built-in health checks and heartbeat
- ✅ **GPU Optimization**: CUDA support with memory optimization
- ✅ **Production-Ready**: Comprehensive error handling and logging

## Deployment Options

### 1. Kaggle Notebooks

```python
# Install dependencies
!pip install -r requirements.txt

# Set environment variables
import os
os.environ["AION_BACKEND_URL"] = "https://your-aion-backend.com"
os.environ["WORKER_ID"] = "kaggle-worker-1"
os.environ["GPU_TYPE"] = "P100"
os.environ["PROVIDER"] = "kaggle"

# Run worker
!python main.py
```

### 2. Modal.com

```python
# modal_deploy.py
import modal

stub = modal.Stub("aion-sd-xl-worker")

image = (
    modal.Image.debian_slim()
    .pip_install_from_requirements("requirements.txt")
)

@stub.function(
    image=image,
    gpu="T4",
    timeout=3600,
)
def run_worker():
    import subprocess
    subprocess.run(["python", "main.py"])

if __name__ == "__main__":
    with stub.run():
        run_worker.remote()
```

### 3. Google Colab

```python
# Colab notebook
!git clone <your-repo>
!cd kb_storage/gpu_workers/sd_xl
!pip install -r requirements.txt

import os
os.environ["AION_BACKEND_URL"] = "https://your-aion-backend.com"
os.environ["WORKER_ID"] = "colab-worker-1"
os.environ["GPU_TYPE"] = "T4"
os.environ["PROVIDER"] = "colab"

!python main.py
```

### 4. Docker

```bash
# Build image
docker build -t aion-sd-xl-worker .

# Run container
docker run --gpus all \
  -e AION_BACKEND_URL=http://your-backend:5000 \
  -e WORKER_ID=docker-worker-1 \
  -e GPU_TYPE=A100 \
  -e PROVIDER=docker \
  -p 8000:8000 \
  aion-sd-xl-worker
```

## API Endpoints

### Health Check
```bash
GET /health
```

### Text-to-Image
```bash
POST /generate/text2img
{
  "prompt": "A beautiful sunset over mountains",
  "negative_prompt": "blurry, low quality",
  "width": 1024,
  "height": 1024,
  "num_inference_steps": 30,
  "guidance_scale": 7.5,
  "seed": 42,
  "num_images": 1
}
```

### Image-to-Image
```bash
POST /generate/img2img
Content-Type: multipart/form-data

prompt: "Turn this into a watercolor painting"
image: [binary file]
strength: 0.8
num_inference_steps: 30
guidance_scale: 7.5
seed: 42
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AION_BACKEND_URL` | AION backend API URL | `http://localhost:5000` |
| `WORKER_ID` | Unique worker identifier | Auto-generated |
| `GPU_TYPE` | GPU model (T4, P100, V100, A100) | `T4` |
| `PROVIDER` | Deployment provider (kaggle, modal, colab) | `kaggle` |
| `OUTPUT_DIR` | Directory for generated images | `/workspace/outputs` |
| `PORT` | FastAPI server port | `8000` |

## GPU Memory Requirements

- **Minimum**: 8GB VRAM (T4)
- **Recommended**: 16GB+ VRAM (P100, V100, A100)
- **CPU Fallback**: Supported (very slow)

## Auto-Registration

Worker automatically registers with AION backend on startup:

```json
{
  "workerId": "sd-xl-abc123",
  "gpuType": "T4",
  "provider": "kaggle",
  "capabilities": ["text2img", "img2img", "lora"],
  "status": "ready"
}
```

## Monitoring

- **Health Check**: GET `/health` every 30s
- **Heartbeat**: POST `/heartbeat` for manual pings
- **GPU Memory**: Tracks CUDA memory allocation/reservation

## License

Part of AION AI System - Enterprise Diamond Plus Edition
