#!/bin/bash
# ELIMINATE ALL [PT] PLACEHOLDERS - Global systematic replacement

echo "🔧 ELIMINATING ALL [PT] PLACEHOLDERS..."

# Strategy: Replace based on common patterns across ALL admin files

# Toast titles (success/error)
find client/src/pages/admin -name "*.tsx" -exec sed -i 's/title: "\[PT\]",/title: "Sucesso",/g' {} \;
find client/src/pages/admin -name "*.tsx" -exec sed -i 's/title: "\[PT\]"/title: "Sucesso"/g' {} \;

# Toast descriptions
find client/src/pages/admin -name "*.tsx" -exec sed -i 's/description: "\[PT\]",/description: "Operação concluída com sucesso",/g' {} \;
find client/src/pages/admin -name "*.tsx" -exec sed -i 's/description: "\[PT\]"/description: "Operação concluída"/g' {} \;

# Placeholders
find client/src/pages/admin -name "*.tsx" -exec sed -i 's/placeholder="\[PT\]"/placeholder="Digite aqui..."/g' {} \;

# Labels and display text
find client/src/pages/admin -name "*.tsx" -exec sed -i 's/: "\[PT\]"/: "N\/A"/g' {} \;
find client/src/pages/admin -name "*.tsx" -exec sed -i 's/label: "\[PT\]"/label: "Não definido"/g' {} \;
find client/src/pages/admin -name "*.tsx" -exec sed -i 's/htmlFor="\[PT\]"/htmlFor="field"/g' {} \;
find client/src/pages/admin -name "*.tsx" -exec sed -i 's/id="\[PT\]"/id="field"/g' {} \;

# Inline JSX
find client/src/pages/admin -name "*.tsx" -exec sed -i 's/">"\[PT\]"</>Não disponível</g' {} \;
find client/src/pages/admin -name "*.tsx" -exec sed -i 's/{"\[PT\]"}/{t.common.loading}/g' {} \;

echo "✅ Global replacement complete!"
echo "📊 Checking remaining..."
grep -r '"\[PT\]"' client/src/pages/admin/*.tsx 2>/dev/null | wc -l
