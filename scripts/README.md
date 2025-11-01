# Scripts de Manutenção do AION

## Database Reset

**⚠️ CUIDADO: Este script apaga TODOS os dados do banco de dados!**

### Uso

```bash
# Executar reset completo
npx tsx scripts/reset-database.ts

# Ou adicione ao package.json:
# "db:reset": "tsx scripts/reset-database.ts"
# E execute: npm run db:reset
```

### O que é deletado

1. ✅ Agents e SubAgents
2. ✅ Namespaces
3. ✅ Knowledge Base Documents
4. ✅ Embeddings
5. ✅ Curation Queue
6. ✅ Training Data
7. ✅ Datasets
8. ✅ Conversations
9. ✅ GPU Workers
10. ✅ Policies extras (mantém apenas default policy)

### Após o reset

1. Reinicie o servidor: `npm run dev`
2. O seed será executado automaticamente
3. Crie manualmente:
   - 1 Namespace root (ex: "financas")
   - 1 Agent com esse namespace
   - 2 Subnamespaces (ex: "financas/investimentos", "financas/impostos")
   - 1 SubAgent com esses subnamespaces

## Outras ferramentas futuras

- `scripts/backup-database.ts` - Backup completo do DB
- `scripts/migrate-data.ts` - Migração de dados antigos
- `scripts/cleanup-orphans.ts` - Limpeza de registros órfãos
