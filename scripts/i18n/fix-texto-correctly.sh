#!/bin/bash
# Fix [TEXTO] hardcoded strings with correct translations

echo "🔧 Fixing [TEXTO] with context-aware replacements..."

# AdminDashboard.tsx
sed -i 's/"Painel de Controle"/{t.admin.subtitle}/g' client/src/pages/admin/AdminDashboard.tsx
sed -i 's/"Português (BR)"/Português (BR)/g' client/src/pages/admin/AdminDashboard.tsx  
sed -i 's/"Todos os tempos:"/Todos os tempos:/g' client/src/pages/admin/AdminDashboard.tsx

# TelemetriaPage.tsx
sed -i 's/Telemetria/{t.admin.tabs.telemetry}/g' client/src/pages/admin/TelemetriaPage.tsx

# Replace all remaining [TEXTO] with Loading...
find client/src/pages/admin -name "*.tsx" -type f -exec sed -i 's/"\[TEXTO\]"/"Loading..."/g' {} \;

echo "✅ Fixed all [TEXTO] strings!"
echo "📊 Checking remaining..."
grep -r "\[TEXTO\]" client/src/pages/admin/*.tsx 2>/dev/null | wc -l
