#!/bin/bash
# Setup Git Hooks for AION
# Run this script once to configure automatic cleanup on commits

echo "🔧 Setting up Git hooks for AION..."

# Create pre-commit hook
cat > .git/hooks/pre-commit << 'EOF'
#!/bin/bash
# AION Auto-cleanup pre-commit hook
# Limpa attached_assets antes de cada commit

echo "🧹 Running attached_assets cleanup..."
./scripts/clean-attached-assets.sh

# Add any cleaned files to git (structure changes)
git add attached_assets/

echo "✅ Pre-commit cleanup complete"
exit 0
EOF

# Make it executable
chmod +x .git/hooks/pre-commit

echo "✅ Git hooks configured successfully!"
echo ""
echo "📝 The pre-commit hook will now automatically:"
echo "   - Clean temporary files from attached_assets/"
echo "   - Preserve kb_storage/ and curation_storage/"
echo "   - Run before every git commit"
echo ""
echo "💡 To test it manually, run: .git/hooks/pre-commit"
