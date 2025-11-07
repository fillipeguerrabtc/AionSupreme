#!/bin/bash
# Clean attached_assets directory while preserving empty subdirectories
# Usage: ./scripts/clean-attached-assets.sh

set -e

ASSETS_DIR="attached_assets"

# Check if directory exists
if [ ! -d "$ASSETS_DIR" ]; then
  echo "Directory $ASSETS_DIR does not exist. Nothing to clean."
  exit 0
fi

echo "🧹 Cleaning $ASSETS_DIR directory..."

# Count files before cleanup
FILES_BEFORE=$(find "$ASSETS_DIR" -type f 2>/dev/null | wc -l)
echo "📊 Files before cleanup: $FILES_BEFORE"

# Remove all files directly in attached_assets root (except .gitkeep)
find "$ASSETS_DIR" -maxdepth 1 -type f ! -name '.gitkeep' -delete 2>/dev/null || true

# Remove all files inside subdirectories (but keep .gitkeep and directories)
find "$ASSETS_DIR" -mindepth 2 -type f ! -name '.gitkeep' -delete 2>/dev/null || true

# Count files after cleanup
FILES_AFTER=$(find "$ASSETS_DIR" -type f 2>/dev/null | wc -l)
echo "📊 Files after cleanup: $FILES_AFTER"

# List remaining directory structure
echo "📁 Preserved directory structure:"
find "$ASSETS_DIR" -type d 2>/dev/null || true

echo "✅ Cleanup complete! Removed $((FILES_BEFORE - FILES_AFTER)) files."

exit 0
