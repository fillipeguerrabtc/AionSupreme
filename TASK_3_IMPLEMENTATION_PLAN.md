# Task 3: Checkpoint Packaging System - Implementation Plan

## ✅ COMPLETED
- Python aggregation script created (`server/federated/aggregate-adapters.py`)
- FedAvg algorithm for LoRA adapters (weighted average)
- Handles adapter_model.bin + config + tokenizer files

## ⚠️ REMAINING WORK (Estimated: 3-5 hours)

### 1. Install Python Dependencies (30 min)
```bash
# Need to install on Replit server:
pip install torch safetensors
```

### 2. Update Worker → Backend Protocol (1-2 hours)

**CURRENT (Gradients):**
- POST /api/training/gradients
- Body: `{ gradients: Record<string, number[]>, numExamples: number }`

**NEW (Adapters):**
- POST /api/training/adapters/:jobId/:workerId/:step
- Body: FormData with adapter.tar.gz file
- Server extracts to `checkpoints/job-X/adapters/worker-Y-step-Z/`

**Changes needed:**
- [ ] New route in `server/routes.ts`
- [ ] Update `training/federated/FEDERATED_TRAINING.py` to compress & upload adapter
- [ ] Update `training/colab/COLAB_FINE_TUNING.py` similarly

### 3. Update GradientAggregator → AdapterAggregator (2 hours)

**Changes needed:**
- [ ] Rename `gradient-aggregator.ts` → `adapter-aggregator.ts`
- [ ] Replace JSON gradient logic with adapter directory tracking
- [ ] Add Python script invocation via `child_process.spawn()`
- [ ] Call `aggregate-adapters.py` when workers complete
- [ ] Compress aggregated adapter to .tar.gz

**Example code:**
```typescript
import { spawn } from 'child_process';

async function aggregateAdapters(
  adapterPaths: Array<{path: string, numExamples: number}>,
  outputDir: string
): Promise<string> {
  const args = [
    '--adapters',
    ...adapterPaths.map(a => `${a.path}:${a.numExamples}`),
    '--output',
    outputDir,
  ];
  
  const python = spawn('python3', ['server/federated/aggregate-adapters.py', ...args]);
  
  return new Promise((resolve, reject) => {
    python.on('exit', (code) => {
      if (code === 0) resolve(outputDir);
      else reject(new Error(`Python aggregation failed with code ${code}`));
    });
  });
}
```

### 4. Compress & Serve Checkpoints (1 hour)

**Changes needed:**
- [ ] Add tar compression after aggregation
- [ ] Update `/api/training/checkpoints/:jobId/download` to serve .tar.gz
- [ ] Update ModelDeploymentService to pass correct URL

**Example code:**
```typescript
import tar from 'tar';

async function compressAdapter(adapterDir: string): Promise<string> {
  const tarPath = `${adapterDir}.tar.gz`;
  await tar.create(
    { gzip: true, file: tarPath, cwd: dirname(adapterDir) },
    [basename(adapterDir)]
  );
  return tarPath;
}
```

### 5. Update Worker Reload Logic (30 min)

**Changes needed:**
- [ ] Worker downloads .tar.gz
- [ ] Worker extracts to temp directory
- [ ] Worker loads PEFT adapter from extracted directory

Already partially done in `COLAB_INFERENCE_SERVER.py` but needs extraction logic.

## 🎯 COMPLETION CRITERIA

✅ Workers upload PEFT adapters (not gradients)  
✅ Backend aggregates adapters using Python script  
✅ Aggregated adapter compressed to .tar.gz  
✅ /download endpoint serves .tar.gz  
✅ Workers successfully download and reload adapters  
✅ Zero HTTP 500 errors on /reload_model  
✅ End-to-end test: Training → Aggregation → Deployment → Reload

## ⚙️ RISKS & ALTERNATIVES

### RISK 1: Python Dependencies
- Need torch installed on server (large download ~500MB)
- Might fail on limited RAM environments

**Mitigation:** Use CPU-only torch build

### RISK 2: Complexity
- Many moving parts to test
- Hard to debug distributed system

**Mitigation:** Add extensive logging at each step

### ALTERNATIVE: Simplified Approach
Instead of hot reload, just:
1. ✅ Aggregate adapters normally
2. ✅ Save to Model Registry
3. ❌ Workers don't hot reload - just restart with new version
4. ✅ Much simpler, less moving parts

**Trade-off:** Lose zero-downtime but gain reliability

## 💡 RECOMMENDATION

Given complexity, suggest:
1. **Implement simplified approach first** (no hot reload)
2. **Validate FedAvg pipeline works end-to-end**
3. **Add hot reload as future enhancement** if needed

This unblocks:
- Task 7: Vector Store FAISS migration
- Task 8: File Upload Security
- Task 10: End-to-end testing

And still delivers **80% of business value** (automatic training & deployment).
