#!/bin/bash
# ELIMINATE FINAL 21 [PT] PLACEHOLDERS

echo "🎯 Fixing final 21 placeholders..."

# AgentsPage - buttons
sed -i 's/isPending ? "\[PT\]"/isPending ? "Carregando..."/g' client/src/pages/admin/AgentsPage.tsx
sed -i 's/variant="secondary">{module.totalOrphans} "\[PT\]"/variant="secondary">{module.totalOrphans} "órfãos"/g' client/src/pages/admin/AgentsPage.tsx

# CurationQueuePage - modals/badges
sed -i 's/title="\[PT\]"/title="Ação"/g' client/src/pages/admin/CurationQueuePage.tsx
sed -i 's/{selectedIds.size} "\[PT\]"/{selectedIds.size} itens/g' client/src/pages/admin/CurationQueuePage.tsx
sed -i 's/"video" ? "\[PT\]"/"video" ? "Vídeo"/g' client/src/pages/admin/CurationQueuePage.tsx

# CostHistoryTab - chart
sed -i 's/stroke="\[PT\]"/stroke="hsl(var(--muted))"/g' client/src/pages/admin/CostHistoryTab.tsx

# GPUOverviewPage - conditional text
sed -i 's/? "\[PT\]"/? "Sim"/g' client/src/pages/admin/GPUOverviewPage.tsx

# ImagesGalleryPage - count badges
sed -i 's/{kbDocuments.length} "\[PT\]"/{kbDocuments.length} documentos/g' client/src/pages/admin/ImagesGalleryPage.tsx
sed -i 's/? "\[PT\]"/? "Carregando..."/g' client/src/pages/admin/ImagesGalleryPage.tsx

# KnowledgeBasePage/Tab - mutations
sed -i 's/isPending ? "\[PT\]"/isPending ? "Processando..."/g' client/src/pages/admin/KnowledgeBasePage.tsx
sed -i 's/isPending ? "\[PT\]"/isPending ? "Processando..."/g' client/src/pages/admin/KnowledgeBaseTab.tsx
sed -i 's/{selectedImages.size} "\[PT\]"/{selectedImages.size} imagens/g' client/src/pages/admin/KnowledgeBaseTab.tsx

# PermissionsPage - form
sed -i 's/name="\[PT\]"/name="permission"/g' client/src/pages/admin/PermissionsPage.tsx

# TelemetriaPage - charts
sed -i 's/name="\[PT\]"/name="Consultas"/g' client/src/pages/admin/TelemetriaPage.tsx
sed -i 's/{query.count} "\[PT\]"/{query.count} queries/g' client/src/pages/admin/TelemetriaPage.tsx

# TokenMonitoring - chart fills and badges
sed -i 's/fill="\[PT\]"/fill="hsl(var(--primary))"/g' client/src/pages/admin/TokenMonitoring.tsx
sed -i 's/.toLocaleString()} "\[PT\]"/.toLocaleString()} restantes/g' client/src/pages/admin/TokenMonitoring.tsx

echo "✅ Final replacements complete!"
echo "📊 Remaining [PT]:"
grep -r '"\[PT\]"' client/src/pages/admin/*.tsx 2>/dev/null | wc -l
