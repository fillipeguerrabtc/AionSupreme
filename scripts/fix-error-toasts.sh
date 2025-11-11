#!/bin/bash
# FIX ERROR TOASTS - Replace "Sucesso" with "Erro" in onError handlers

echo "🔧 Fixing error toast titles..."

# Find and replace "Sucesso" with "Erro" in onError contexts
find client/src/pages/admin -name "*.tsx" -exec sed -i '/onError/,/^\s*}/s/title: "Sucesso"/title: "Erro"/g' {} \;

echo "✅ Error toast titles fixed!"
echo "📊 Verifying..."
grep -n 'onError.*title: "Sucesso"' client/src/pages/admin/*.tsx 2>/dev/null | wc -l
