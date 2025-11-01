# Guia de Configuração de Workers GPU para Geração Profissional de Vídeo

⚠️ **NOTA**: Este guia é para **GERAÇÃO DE VÍDEO** (RunPod/Modal - PAGO)

Para **INFERÊNCIA/TREINO GRÁTIS** (Colab/Kaggle), veja: [SETUP_GPU_WORKERS.md](./SETUP_GPU_WORKERS.md)

---

## 🎬 Visão Geral

AION usa **workers apoiados por GPU** para gerar vídeos profissionais de qualidade cinematográfica usando modelos open-source:
- **Open-Sora 1.2** (primário) - Text-to-video de alta qualidade
- **AnimateDiff + Stable Video Diffusion** (secundário)
- **ModelScope** (fallback terciário)

**Diferenças:**
| Recurso | Geração de Vídeo (Este Guia) | Inferência/Treinamento (SETUP_GPU_WORKERS.md) |
|---------|------------------------------|-----------------------------------------------|
| Uso | Geração de vídeos profissionais | Inferência LLM + Treinamento LoRA |
| Plataforma | RunPod, Modal (pago) | Google Colab, Kaggle (grátis) |
| GPU | RTX 4090, A6000 (24GB+) | T4, P100 (15-16GB) |
| Custo | ~$0.40-0.80/hora | $0 (100% grátis) |

## 📋 Pré-requisitos

- GPU NVIDIA com ≥16GB VRAM (24GB recomendado para 4K)
- CUDA 11.8+ e cuDNN
- Docker (recomendado) ou Python 3.10+
- Conta RunPod/Modal (para implantação em nuvem) OU GPU auto-hospedada

---

## 🚀 Início Rápido: Implantar Worker no RunPod

### 1. Criar Conta RunPod
Visite https://runpod.io e crie uma conta. Adicione créditos GPU (~$10 para teste).

### 2. Implantar Template de Worker

```bash
# Clonar repositório do worker
git clone https://github.com/sua-org/aion-video-worker.git
cd aion-video-worker

# Construir imagem Docker
docker build -t aion-video-worker:latest .

# Enviar para Docker Hub (ou registro de contêiner RunPod)
docker tag aion-video-worker:latest seu-dockerhub/aion-video-worker:latest
docker push seu-dockerhub/aion-video-worker:latest
```

### 3. Configurar Pod RunPod

1. Vá para Console RunPod → Pods → Deploy New Pod
2. Selecione **GPU**: RTX 4090 ou A6000 (48GB VRAM recomendado)
3. Imagem do Contêiner: `seu-dockerhub/aion-video-worker:latest`
4. Disco do Contêiner: 50GB mínimo
5. Volume: 100GB para pesos do modelo
6. Expor Porta: `8000` (HTTP)
7. Variáveis de Ambiente:
   ```
   MODEL=open-sora
   WORKERS=1
   WEBHOOK_SECRET=sua-chave-secreta
   ```

### 4. Conectar AION ao Worker

No seu projeto Replit, adicione variável de ambiente:

```bash
VIDEO_WORKER_URL=https://seu-pod-id-8000.proxy.runpod.net/generate
```

Reinicie seu servidor AION.

---

## 🏗️ Arquitetura do Worker

### Entrada (POST /generate)
```json
{
  "job_id": 123,
  "prompt": "Um dragão majestoso voando sobre montanhas ao pôr do sol",
  "parameters": {
    "duration": 30,
    "fps": 24,
    "resolution": "1080p",
    "style": "cinematic",
    "scenes": 3,
    "audio": true,
    "model": "open-sora"
  },
  "callback_url": "https://seu-aion.replit.app/api/videos/webhook"
}
```

### Pipeline de Processamento
1. **Planejamento de Cenas** - Dividir prompt em sequências multi-shot
2. **Geração de Vídeo** - Síntese Open-Sora/AnimateDiff
3. **Montagem** - Concatenação de cenas FFmpeg
4. **Upscaling** - Upscaling temporal Real-ESRGAN
5. **Interpolação de Frames** - RIFE para movimento suave
6. **Síntese de Áudio** - TTS ElevenLabs/Bark + música
7. **Sincronização de Áudio** - Alinhar narração com vídeo

### Saída (POST callback_url/webhook)
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

## 🐳 Implementação do Worker Docker

### Dockerfile
```dockerfile
FROM nvidia/cuda:11.8.0-cudnn8-runtime-ubuntu22.04

# Instalar dependências do sistema
RUN apt-get update && apt-get install -y \
    python3.10 python3-pip git ffmpeg \
    libsm6 libxext6 libxrender-dev

# Instalar pacotes Python
RUN pip3 install torch torchvision --index-url https://download.pytorch.org/whl/cu118
RUN pip3 install diffusers transformers accelerate xformers
RUN pip3 install opencv-python pillow numpy scipy
RUN pip3 install fastapi uvicorn httpx

# Clonar modelos
RUN git clone https://huggingface.co/hpcai-tech/Open-Sora /models/open-sora
RUN git clone https://huggingface.co/guoyww/animatediff /models/animatediff

# Copiar código do worker
WORKDIR /app
COPY worker.py .
COPY requirements.txt .
RUN pip3 install -r requirements.txt

EXPOSE 8000
CMD ["uvicorn", "worker:app", "--host", "0.0.0.0", "--port", "8000"]
```

### worker.py (Exemplo)
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
    # Iniciar geração em background
    background_tasks.add_task(process_video, request)
    return {"status": "processing", "job_id": request.job_id}

async def process_video(request: VideoRequest):
    try:
        # 1. Carregar modelo (Open-Sora)
        from opensora.models import OpenSoraModel
        model = OpenSoraModel.from_pretrained("/models/open-sora")
        
        # 2. Gerar vídeo
        video_path = await model.generate(
            prompt=request.prompt,
            duration=request.parameters.get("duration", 30),
            fps=request.parameters.get("fps", 24),
            resolution=request.parameters.get("resolution", "1080p"),
        )
        
        # 3. Upload para storage
        video_url = await upload_to_storage(video_path)
        
        # 4. Callback para AION
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
        # Callback com erro
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
    # Upload para S3/R2/RunPod Storage
    # Retornar URL pública
    pass
```

---

## 🖥️ Configuração Auto-Hospedada (Avançado)

### Requisitos
- Ubuntu 22.04 LTS
- GPU NVIDIA (RTX 3090, 4090, A6000, etc.)
- 32GB+ RAM
- 500GB+ SSD

### Instalação
```bash
# Instalar CUDA
wget https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2204/x86_64/cuda-keyring_1.0-1_all.deb
sudo dpkg -i cuda-keyring_1.0-1_all.deb
sudo apt-get update
sudo apt-get install cuda-11-8

# Instalar cuDNN
# Baixar do site da NVIDIA
sudo dpkg -i cudnn-local-repo-ubuntu2204-8.9.0.131_1.0-1_amd64.deb

# Instalar ambiente Python
sudo apt install python3.10 python3-pip python3-venv
python3 -m venv venv
source venv/bin/activate

# Instalar dependências
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu118
pip install diffusers transformers accelerate xformers
pip install fastapi uvicorn httpx pillow opencv-python

# Baixar modelos
git lfs install
git clone https://huggingface.co/hpcai-tech/Open-Sora models/open-sora
git clone https://huggingface.co/guoyww/animatediff models/animatediff

# Executar worker
uvicorn worker:app --host 0.0.0.0 --port 8000
```

### Expor com ngrok (para teste)
```bash
ngrok http 8000
# Usar URL ngrok como VIDEO_WORKER_URL no AION
```

---

## 📊 Comparação de Modelos

| Modelo | Qualidade | Velocidade | VRAM | Melhor Para |
|--------|-----------|------------|------|-------------|
| **Open-Sora 1.2** | ⭐⭐⭐⭐⭐ | Médio | 24GB | Cinematográfico, realista |
| **AnimateDiff** | ⭐⭐⭐⭐ | Rápido | 16GB | Animado, estilizado |
| **ModelScope** | ⭐⭐⭐ | Muito Rápido | 12GB | Rascunhos rápidos |

---

## 🔧 Solução de Problemas

### Out of Memory (OOM)
- Reduzir resolução: 4K → 1080p → 720p
- Reduzir duração: 120s → 60s → 30s
- Habilitar offloading do modelo: `model.enable_model_cpu_offload()`

### Geração Lenta
- Usar precisão mista: `torch.autocast("cuda")`
- Habilitar xformers: `model.enable_xformers_memory_efficient_attention()`
- Reduzir FPS: 30 → 24 → 15

### Worker Não Acessível
- Verificar regras de firewall (porta 8000 aberta)
- Verificar status do proxy ngrok/RunPod
- Testar com: `curl http://worker-url/health`

---

## 💡 Estimativas de Custo

### RunPod (GPU Cloud)
- RTX 4090: ~$0.40/hora
- A6000 (48GB): ~$0.80/hora
- Geração de vídeo de 30s: ~2-5 minutos = $0.01-0.05/vídeo

### Auto-Hospedado
- RTX 4090: ~$1.600 único
- Eletricidade: ~$0.50/dia (24/7)
- Break-even: ~3.200 vídeos

---

## 📚 Recursos

- Open-Sora: https://github.com/hpcaitech/Open-Sora
- AnimateDiff: https://github.com/guoyww/AnimateDiff
- Docs RunPod: https://docs.runpod.io
- Docs Modal: https://modal.com/docs

---

## ✅ Próximos Passos

1. **Implantar Worker**: RunPod ou auto-hospedado
2. **Definir VIDEO_WORKER_URL**: Variável de ambiente no AION
3. **Testar**: POST /api/videos/generate com prompt simples
4. **Monitorar**: Verificar /api/videos/jobs/:id para status
5. **Escalar**: Adicionar mais workers para processamento paralelo
