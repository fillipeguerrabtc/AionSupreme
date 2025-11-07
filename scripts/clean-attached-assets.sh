#!/bin/bash
# Clean attached_assets directory ONLY (temporary files)
# 
# ⚠️  PROTEÇÃO AUTOMÁTICA - NUNCA LIMPA:
# - kb_storage/* = Armazenamento permanente (imagens, documentos, geradas)
# - curation_storage/* = Fila HITL (pending, approved, rejected)
# 
# Limpa APENAS arquivos temporários em attached_assets/
# Usage: ./scripts/clean-attached-assets.sh

set -e

ASSETS_DIR="attached_assets"

# Diretórios PROTEGIDOS (fora de attached_assets, nunca tocar)
PROTECTED_DIRS=(
  "kb_storage"
  "curation_storage"
)

# Check if directory exists
if [ ! -d "$ASSETS_DIR" ]; then
  echo "Directory $ASSETS_DIR does not exist. Nothing to clean."
  exit 0
fi

echo "🧹 Cleaning $ASSETS_DIR directory (temporary files only)..."
echo ""

# Mostrar arquivos protegidos
echo "🔒 PROTECTED DIRECTORIES (will NOT be cleaned):"
for protected in "${PROTECTED_DIRS[@]}"; do
  if [ -d "$protected" ]; then
    count=$(find "$protected" -type f 2>/dev/null | wc -l)
    echo "   ✓ $protected/ ($count files preserved)"
  fi
done
echo ""

# Count files before cleanup
FILES_BEFORE=$(find "$ASSETS_DIR" -type f 2>/dev/null | wc -l)
echo "📊 Files in $ASSETS_DIR before cleanup: $FILES_BEFORE"

# Remove all files directly in attached_assets root (except .gitkeep)
find "$ASSETS_DIR" -maxdepth 1 -type f ! -name '.gitkeep' -delete 2>/dev/null || true

# Remove all files inside subdirectories (but keep .gitkeep and directories)
find "$ASSETS_DIR" -mindepth 2 -type f ! -name '.gitkeep' -delete 2>/dev/null || true

# Count files after cleanup
FILES_AFTER=$(find "$ASSETS_DIR" -type f 2>/dev/null | wc -l)
echo "📊 Files in $ASSETS_DIR after cleanup:  $FILES_AFTER"

# List remaining directory structure
echo ""
echo "📁 Preserved directory structure in $ASSETS_DIR:"
find "$ASSETS_DIR" -type d 2>/dev/null || true

echo ""
echo "✅ Cleanup complete! Removed $((FILES_BEFORE - FILES_AFTER)) files from $ASSETS_DIR."
echo ""
echo "💡 Permanent storage preserved:"
echo "   - kb_storage/        (images, documents, generated content)"
echo "   - curation_storage/  (pending, approved, rejected HITL queue)"
echo ""

# Avisar sobre learned_images (deprecated)
if [ -d "attached_assets/learned_images" ]; then
  count=$(find "attached_assets/learned_images" -type f 2>/dev/null | wc -l)
  if [ "$count" -gt 0 ]; then
    echo "⚠️  MIGRATION NEEDED:"
    echo "   attached_assets/learned_images/ ($count files) is DEPRECATED"
    echo "   Run: tsx scripts/migrate-learned-images.ts --execute"
    echo "   To move to: kb_storage/images/ (permanent storage)"
    echo ""
  fi
fi

exit 0
