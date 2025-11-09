"""
AION - Kaggle Deployment Script for SD-XL Worker
Automatically deploys worker to Kaggle notebooks via official API
"""

import os
import json
import time
from pathlib import Path

try:
    from kaggle import api
except ImportError:
    print("❌ Kaggle API not installed. Run: pip install kaggle")
    exit(1)


def create_kaggle_notebook(worker_id: str, backend_url: str):
    """
    Create and run Kaggle notebook with SD-XL worker
    
    Args:
        worker_id: Unique identifier for this worker
        backend_url: AION backend URL for registration
    """
    
    notebook_title = f"AION-SD-XL-Worker-{worker_id}"
    
    # Notebook code
    notebook_code = f"""
# AION Stable Diffusion XL Worker - Kaggle Deployment
# Auto-generated deployment notebook

import os
import subprocess
import sys

# Install dependencies
print("📦 Installing dependencies...")
subprocess.run([sys.executable, "-m", "pip", "install", "-q", 
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
])

# Download worker code
print("📥 Downloading worker code...")
worker_code = '''
{open('main.py', 'r').read()}
'''

with open('worker.py', 'w') as f:
    f.write(worker_code)

# Set environment variables
os.environ["AION_BACKEND_URL"] = "{backend_url}"
os.environ["WORKER_ID"] = "{worker_id}"
os.environ["GPU_TYPE"] = "P100"  # Kaggle default GPU
os.environ["PROVIDER"] = "kaggle"
os.environ["OUTPUT_DIR"] = "/kaggle/working/outputs"

# Run worker
print("🚀 Starting SD-XL worker...")
print(f"Worker ID: {worker_id}")
print(f"Backend: {backend_url}")

subprocess.run([sys.executable, "worker.py"])
"""
    
    # Create notebook metadata
    notebook = {
        "cells": [
            {
                "cell_type": "code",
                "execution_count": None,
                "metadata": {},
                "outputs": [],
                "source": notebook_code.split('\n')
            }
        ],
        "metadata": {
            "kernelspec": {
                "display_name": "Python 3",
                "language": "python",
                "name": "python3"
            },
            "language_info": {
                "name": "python",
                "version": "3.10.12"
            }
        },
        "nbformat": 4,
        "nbformat_minor": 4
    }
    
    # Save notebook
    notebook_path = Path(f"/tmp/{notebook_title}.ipynb")
    with open(notebook_path, 'w') as f:
        json.dump(notebook, f, indent=2)
    
    print(f"✅ Created notebook: {notebook_path}")
    
    # Upload to Kaggle
    try:
        print("📤 Uploading to Kaggle...")
        
        # Create kernel metadata
        kernel_metadata = {
            "id": f"aion/{notebook_title.lower()}",
            "title": notebook_title,
            "code_file": str(notebook_path),
            "language": "python",
            "kernel_type": "notebook",
            "is_private": True,
            "enable_gpu": True,
            "enable_internet": True,
            "dataset_sources": [],
            "competition_sources": [],
            "kernel_sources": []
        }
        
        # Push kernel
        api.kernels_push(kernel_metadata)
        print(f"✅ Notebook uploaded to Kaggle: {notebook_title}")
        
        # Auto-run notebook
        print("▶️  Starting notebook execution...")
        time.sleep(5)  # Wait for kernel to be created
        
        kernel_url = f"https://www.kaggle.com/code/aion/{notebook_title.lower()}"
        print(f"🔗 Notebook URL: {kernel_url}")
        
        return kernel_url
        
    except Exception as e:
        print(f"❌ Failed to upload notebook: {e}")
        return None


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Deploy SD-XL worker to Kaggle")
    parser.add_argument("--worker-id", required=True, help="Worker ID")
    parser.add_argument("--backend-url", required=True, help="AION backend URL")
    
    args = parser.parse_args()
    
    create_kaggle_notebook(args.worker_id, args.backend_url)
