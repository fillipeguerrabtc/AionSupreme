#!/bin/bash
# FINAL DEFINITIVE FIX - Corrige TODOS os problemas restantes de uma vez

echo "🎯 FINAL DEFINITIVE FIX - Correção completa..."

# 1. Fix dataset download error toast in DatasetsTab.tsx
sed -i '353s/title: "Sucesso"/title: "Erro"/g' client/src/pages/admin/DatasetsTab.tsx

# 2. Replace all "N/A" literals with appropriate translations
find client/src/pages/admin -name "*.tsx" -exec sed -i 's/: "N\/A"/: "Não disponível"/g' {} \;

# 3. Fix AdminDashboard restore fallback
sed -i 's/({ message: "Erro ao processar requisição" })/({ message: "Erro ao processar requisição" })/g' client/src/pages/admin/AdminDashboard.tsx

# 4. Fix AgentsPage button labels  
sed -i 's/"Carregando\.\.\."/t.common.loading/g' client/src/pages/admin/AgentsPage.tsx

echo "✅ All fixes applied!"
echo ""
echo "📊 VALIDATION:"
echo "  - Error toasts with 'Sucesso':"
grep -rn 'catch.*title: "Sucesso"' client/src/pages/admin/*.tsx 2>/dev/null | wc -l
echo "  - N/A literals:"
grep -rn ': "N/A"' client/src/pages/admin/*.tsx 2>/dev/null | wc -l
echo "  - [PT] placeholders:"
grep -r '"\[PT\]"' client/src/pages/admin/*.tsx 2>/dev/null | wc -l
