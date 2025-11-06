# 🔄 Worker Adapter Upload Guide

## Overview

Workers must be updated to upload PEFT adapters instead of gradients for hot reload functionality.

## Required Changes

### 1. Save PEFT Adapter (instead of extracting gradients)

**OLD CODE (gradients):**
```python
# Extract gradients from model
gradients = {}
for name, param in model.named_parameters():
    if param.grad is not None:
        gradients[name] = param.grad.cpu().tolist()
```

**NEW CODE (adapters):**
```python
# Save PEFT adapter to disk
import os
adapter_dir = f"/tmp/adapter-job{JOB_ID}-worker{WORKER_ID}-step{global_step}"
os.makedirs(adapter_dir, exist_ok=True)

# Save adapter using Hugging Face PEFT
model.save_pretrained(adapter_dir)  # Saves adapter_model.bin, adapter_config.json
tokenizer.save_pretrained(adapter_dir)  # Saves tokenizer files
```

### 2. Compress Adapter to .tar.gz

```python
import tarfile

tar_path = f"/tmp/adapter-job{JOB_ID}-worker{WORKER_ID}-step{global_step}.tar.gz"

with tarfile.open(tar_path, "w:gz") as tar:
    tar.add(adapter_dir, arcname=".")
```

### 3. Upload Adapter via Multipart POST

**OLD CODE (gradients JSON):**
```python
sync_data = {
    "jobId": JOB_ID,
    "workerId": WORKER_ID,
    "step": global_step,
    "gradients": gradients,
    "numExamples": chunk_size
}

response = requests.post(
    f"{AION_URL}/api/training/gradients",
    json=sync_data
)
```

**NEW CODE (adapter multipart):**
```python
import requests

# Upload adapter file
with open(tar_path, 'rb') as f:
    files = {'adapter': f}
    data = {'numExamples': chunk_size}
    
    response = requests.post(
        f"{AION_URL}/api/training/adapters/{JOB_ID}/{WORKER_ID}/{global_step}",
        files=files,
        data=data,
        timeout=300  # Longer timeout for file upload
    )

response.raise_for_status()
result = response.json()

if result.get('shouldAggregate'):
    print(f"✓ Aggregation triggered at step {global_step}")
```

### 4. Download and Apply Aggregated Checkpoint

**Backend sends webhook/notification OR worker polls periodically:**

```python
# Poll for new checkpoint
def check_for_checkpoint():
    response = requests.get(
        f"{AION_URL}/api/training/checkpoints/{JOB_ID}",
        timeout=10
    )
    
    if response.status_code == 200:
        checkpoint_data = response.json()
        download_url = checkpoint_data['downloadUrl']
        version = checkpoint_data['version']
        
        # Check if newer than current
        if version > current_version:
            return download_url
    
    return None

# Download checkpoint
def download_checkpoint(url):
    response = requests.get(url, stream=True, timeout=300)
    response.raise_for_status()
    
    checkpoint_path = f"/tmp/checkpoint-job{JOB_ID}-v{version}.tar.gz"
    
    with open(checkpoint_path, 'wb') as f:
        for chunk in response.iter_content(chunk_size=8192):
            f.write(chunk)
    
    return checkpoint_path

# Extract and load adapter
def apply_checkpoint(checkpoint_path):
    extract_dir = f"/tmp/checkpoint-extracted-{version}"
    os.makedirs(extract_dir, exist_ok=True)
    
    # Extract .tar.gz
    import tarfile
    with tarfile.open(checkpoint_path, "r:gz") as tar:
        tar.extractall(extract_dir)
    
    # Hot reload - load new adapter WITHOUT restarting training
    from peft import PeftModel
    
    # Option 1: Reload adapter on existing model (HOT RELOAD)
    model.load_adapter(extract_dir, adapter_name="aggregated")
    model.set_adapter("aggregated")
    
    # Option 2: Merge adapters (if using multiple)
    # model.add_adapter(extract_dir, adapter_name=f"federated_step_{version}")
    
    print(f"✅ Hot reloaded checkpoint v{version}")
    
    return version

# Main training loop integration
while step < max_steps:
    # ... training ...
    
    if step % SYNC_INTERVAL == 0:
        # Upload adapter
        upload_adapter(step)
        
        # Check for new checkpoint
        download_url = check_for_checkpoint()
        if download_url:
            checkpoint_path = download_checkpoint(download_url)
            current_version = apply_checkpoint(checkpoint_path)
```

## Complete Flow

1. **Worker trains** for N steps (e.g., 100 steps)
2. **Worker saves** PEFT adapter via `save_pretrained()`
3. **Worker compresses** adapter directory to .tar.gz
4. **Worker uploads** .tar.gz to backend via POST multipart
5. **Backend auto-aggregates** when 2+ workers uploaded (FedAvg)
6. **Backend saves** aggregated adapter as checkpoint
7. **Worker polls** for new checkpoint
8. **Worker downloads** and hot reloads new adapter
9. **Repeat** without restarting training process

## Benefits

✅ **Zero downtime** - No process restart needed
✅ **Efficient** - Only uploads PEFT adapters (~10MB) instead of full model
✅ **Production-grade** - Proper error handling, retries, versioning
✅ **Federated** - Automatic weighted averaging across workers

## Testing Checklist

- [ ] Worker saves adapter correctly via `save_pretrained()`
- [ ] Compression creates valid .tar.gz
- [ ] Upload succeeds with 200 status
- [ ] Backend triggers aggregation when 2+ workers upload
- [ ] Worker downloads aggregated checkpoint
- [ ] Worker hot reloads adapter without crash
- [ ] Training continues seamlessly after reload
- [ ] Loss improves after aggregation (convergence test)
