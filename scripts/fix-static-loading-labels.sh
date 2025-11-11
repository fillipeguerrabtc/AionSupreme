#!/bin/bash
# Fix ALL static t.common.loading placeholders with contextual labels

echo "🔧 Fixing static loading labels in AgentsPage.tsx..."

# Line 219: TableHead → "Ícone"
sed -i '219s/{t\.common\.loading}/Ícone/g' client/src/pages/admin/AgentsPage.tsx

# Line 224: TableHead → "Ações"
sed -i '224s/{t\.common\.loading}/Ações/g' client/src/pages/admin/AgentsPage.tsx

# Line 302: DialogDescription → "Editando agente:"
sed -i '302s/{t\.common\.loading}/Editando agente:/g' client/src/pages/admin/AgentsPage.tsx

# Line 322: help text → "O slug é gerado automaticamente e não pode ser alterado"
sed -i '322s/{t\.common\.loading}/O slug é gerado automaticamente e não pode ser alterado/g' client/src/pages/admin/AgentsPage.tsx

# Line 325: Label → "Descrição"
sed -i '325s/{t\.common\.loading}/Descrição/g' client/src/pages/admin/AgentsPage.tsx

# Line 347: help text → "Selecione os namespaces que este agente pode acessar"
sed -i '347s/{t\.common\.loading}/Selecione os namespaces que este agente pode acessar/g' client/src/pages/admin/AgentsPage.tsx

# Line 359: help text → "Ferramentas disponíveis para este agente"
sed -i '359s/{t\.common\.loading}/Ferramentas disponíveis para este agente/g' client/src/pages/admin/AgentsPage.tsx

# Line 386: AlertDialogTitle → "Confirmar Exclusão"
sed -i '386s/{t\.common\.loading}/Confirmar Exclusão/g' client/src/pages/admin/AgentsPage.tsx

# Line 387: AlertDialogDescription → "Esta ação não pode ser desfeita. Deseja continuar?"
sed -i '387s/{t\.common\.loading}/Esta ação não pode ser desfeita. Deseja continuar?/g' client/src/pages/admin/AgentsPage.tsx

# Line 400: AlertDialogAction → "Excluir Agente"
sed -i '400s/>{t\.common\.loading}</Excluir Agente</g' client/src/pages/admin/AgentsPage.tsx

# Line 409: DialogTitle → "Detalhes do Scan"
sed -i '409s/{t\.common\.loading}/Detalhes do Scan/g' client/src/pages/admin/AgentsPage.tsx

# Line 410: DialogDescription → "Resultados da análise de órfãos"
sed -i '410s/{t\.common\.loading}/Resultados da análise de órfãos/g' client/src/pages/admin/AgentsPage.tsx

# Line 426: help text → "Severidade Média"
sed -i '426s/{t\.common\.loading}/Severidade Média/g' client/src/pages/admin/AgentsPage.tsx

# Line 460: strong → "Ação Sugerida:"
sed -i '460s/<strong>{t\.common\.loading}<\/strong>/<strong>Ação Sugerida:<\/strong>/g' client/src/pages/admin/AgentsPage.tsx

# Line 473: success message → "Nenhum órfão encontrado!"
sed -i '473s/{t\.common\.loading}/Nenhum órfão encontrado!/g' client/src/pages/admin/AgentsPage.tsx

# Line 474: description → "Todos os agentes e módulos estão corretamente configurados"
sed -i '474s/{t\.common\.loading}/Todos os agentes e módulos estão corretamente configurados/g' client/src/pages/admin/AgentsPage.tsx

echo "✅ All static loading labels fixed!"
echo "📊 Remaining t.common.loading in AgentsPage:"
grep -n '{t.common.loading}' client/src/pages/admin/AgentsPage.tsx | wc -l
