#!/bin/bash
# Restaurar AgentsPage.tsx para versão funcional

# Remover linhas duplicadas 391-402 (AlertDialogAction duplicado)
sed -i '391,402d' client/src/pages/admin/AgentsPage.tsx

echo "✅ AgentsPage.tsx restaurado!"
echo "📊 Verificando erros LSP..."
