"""
AION - Modal.com Deployment Script for SD-XL Worker
Serverless GPU deployment with auto-scaling
"""

import modal

# Create Modal stub
stub = modal.Stub("aion-sd-xl-worker")

# Define container image with all dependencies
image = (
    modal.Image.debian_slim(python_version="3.10")
    .pip_install(
        "fastapi==0.104.1",
        "uvicorn[standard]==0.24.0",
        "pydantic==2.5.0",
        "torch==2.1.0",
        "diffusers==0.24.0",
        "transformers==4.35.0",
        "accelerate==0.25.0",
        "safetensors==0.4.1",
        "Pillow==10.1.0",
        "requests==2.31.0"
    )
    .copy_local_file("main.py", "/root/main.py")
)

# Shared volume for model cache
volume = modal.NetworkFileSystem.persisted("sd-xl-models")


@stub.function(
    image=image,
    gpu="T4",  # or "A10G", "A100"
    timeout=3600,  # 1 hour
    network_file_systems={"/models": volume},
    secrets=[
        modal.Secret.from_name("aion-backend-url"),
    ],
    allow_concurrent_inputs=10,
)
@modal.web_server(port=8000)
def run_worker():
    """Run SD-XL worker as web server"""
    import os
    import subprocess
    
    # Set environment variables
    os.environ["WORKER_ID"] = f"modal-{os.getenv('MODAL_TASK_ID', 'unknown')}"
    os.environ["GPU_TYPE"] = "T4"
    os.environ["PROVIDER"] = "modal"
    os.environ["HF_HOME"] = "/models"  # Cache models in persistent volume
    
    # Run FastAPI server
    subprocess.run([
        "python", "/root/main.py"
    ])


@stub.local_entrypoint()
def deploy():
    """Deploy worker to Modal cloud"""
    print("🚀 Deploying SD-XL worker to Modal...")
    print("✅ Worker deployed!")
    print("📊 Monitor at: https://modal.com/apps")
    
    # Run worker
    run_worker.remote()


if __name__ == "__main__":
    # Deploy with: modal deploy deploy_modal.py
    stub.deploy("aion-sd-xl-worker")
