#!/usr/bin/env python3
"""
PEFT Adapter Aggregation Script (FedAvg for LoRA)

Aggregates multiple PEFT LoRA adapters using weighted average (FedAvg).
Called by Node.js backend after collecting adapter snapshots from workers.

Usage:
    python aggregate-adapters.py \
        --adapters /path/adapter1:100 /path/adapter2:150 \
        --output /path/aggregated-adapter
    
Args:
    --adapters: List of "adapter_path:num_examples" pairs
    --output: Output directory for aggregated adapter
    
Returns:
    Exit code 0 on success, non-zero on failure
"""

import argparse
import sys
import json
import shutil
from pathlib import Path
from typing import List, Tuple, Dict
import torch


def load_adapter_weights(adapter_path: str) -> Dict[str, torch.Tensor]:
    """Load LoRA adapter weights from directory."""
    # Try different possible weight file names
    weight_files = [
        "adapter_model.bin",
        "adapter_model.safetensors",
        "pytorch_model.bin",
    ]
    
    adapter_dir = Path(adapter_path)
    
    for weight_file in weight_files:
        weight_path = adapter_dir / weight_file
        if weight_path.exists():
            print(f"   Loading weights from {weight_file}...")
            if weight_file.endswith('.safetensors'):
                from safetensors.torch import load_file
                return load_file(str(weight_path))
            else:
                return torch.load(str(weight_path), map_location='cpu')
    
    raise FileNotFoundError(f"No adapter weights found in {adapter_path}")


def aggregate_adapters(
    adapter_paths_with_weights: List[Tuple[str, int]],
    output_dir: str
) -> None:
    """
    Aggregate multiple LoRA adapters using FedAvg (weighted average).
    
    Args:
        adapter_paths_with_weights: List of (adapter_path, num_examples) tuples
        output_dir: Output directory for aggregated adapter
    """
    print("\n" + "="*80)
    print("🔄 PEFT Adapter Aggregation (FedAvg)")
    print("="*80)
    
    # Calculate total examples for weighting
    total_examples = sum(weight for _, weight in adapter_paths_with_weights)
    print(f"\n📊 Total examples across workers: {total_examples}")
    print(f"📊 Number of workers: {len(adapter_paths_with_weights)}")
    
    # Load all adapters
    print("\n📥 Loading adapter weights...")
    adapters = []
    for adapter_path, num_examples in adapter_paths_with_weights:
        weight_ratio = num_examples / total_examples
        print(f"   - {adapter_path}: {num_examples} examples ({weight_ratio*100:.1f}%)")
        
        weights = load_adapter_weights(adapter_path)
        adapters.append((weights, weight_ratio))
    
    # Initialize aggregated weights with zeros
    print("\n🔧 Aggregating weights (weighted average)...")
    aggregated_weights = {}
    
    # Get all parameter names from first adapter
    param_names = list(adapters[0][0].keys())
    
    for param_name in param_names:
        # Weighted sum of all adapters
        aggregated_param = None
        
        for weights, weight_ratio in adapters:
            if param_name not in weights:
                print(f"   ⚠️  Warning: {param_name} not found in adapter, skipping")
                continue
            
            weighted_param = weights[param_name] * weight_ratio
            
            if aggregated_param is None:
                aggregated_param = weighted_param
            else:
                aggregated_param += weighted_param
        
        if aggregated_param is not None:
            aggregated_weights[param_name] = aggregated_param
    
    print(f"   ✓ Aggregated {len(aggregated_weights)} parameters")
    
    # Save aggregated adapter
    print(f"\n💾 Saving aggregated adapter to {output_dir}...")
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    
    # Save weights
    weight_file = output_path / "adapter_model.bin"
    torch.save(aggregated_weights, str(weight_file))
    print(f"   ✓ Weights saved: {weight_file}")
    
    # Copy config and tokenizer from first adapter (they should be identical)
    first_adapter_path = Path(adapter_paths_with_weights[0][0])
    
    # Copy adapter config
    config_file = first_adapter_path / "adapter_config.json"
    if config_file.exists():
        shutil.copy(config_file, output_path / "adapter_config.json")
        print(f"   ✓ Config copied: adapter_config.json")
    
    # Copy tokenizer files
    tokenizer_files = [
        "tokenizer_config.json",
        "tokenizer.json",
        "special_tokens_map.json",
        "vocab.json",
        "merges.txt",
    ]
    
    for tokenizer_file in tokenizer_files:
        src_file = first_adapter_path / tokenizer_file
        if src_file.exists():
            shutil.copy(src_file, output_path / tokenizer_file)
            print(f"   ✓ Tokenizer file copied: {tokenizer_file}")
    
    print("\n✅ Aggregation complete!")
    print("="*80 + "\n")


def main():
    parser = argparse.ArgumentParser(description="Aggregate PEFT LoRA adapters using FedAvg")
    parser.add_argument(
        "--adapters",
        nargs="+",
        required=True,
        help="Adapter paths with weights (format: path:num_examples)"
    )
    parser.add_argument(
        "--output",
        required=True,
        help="Output directory for aggregated adapter"
    )
    
    args = parser.parse_args()
    
    # Parse adapter paths and weights
    adapter_paths_with_weights = []
    for adapter_spec in args.adapters:
        try:
            path, weight_str = adapter_spec.split(":")
            weight = int(weight_str)
            adapter_paths_with_weights.append((path, weight))
        except ValueError:
            print(f"❌ Invalid adapter spec: {adapter_spec}")
            print("   Expected format: /path/to/adapter:num_examples")
            sys.exit(1)
    
    # Validate adapter paths exist
    for adapter_path, _ in adapter_paths_with_weights:
        if not Path(adapter_path).exists():
            print(f"❌ Adapter path not found: {adapter_path}")
            sys.exit(1)
    
    try:
        aggregate_adapters(adapter_paths_with_weights, args.output)
        sys.exit(0)
    except Exception as e:
        print(f"\n❌ Aggregation failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
