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

## Limpeza de Assets Temporários

### 📋 Visão Geral
O script `clean-attached-assets.sh` remove automaticamente todos os arquivos temporários do diretório `attached_assets/`, preservando apenas a estrutura de subpastas vazias versionadas.

### 🚀 Uso
```bash
# Executar limpeza manual
./scripts/clean-attached-assets.sh
```

### ⚙️ Funcionamento
1. **Remove todos os arquivos** de `attached_assets/` (raiz e subpastas)
2. **Preserva arquivos `.gitkeep`** para manter subpastas versionadas
3. **Mantém estrutura de diretórios** intacta:
   - `generated_images/`
   - `chat_images/`
   - `stock_images/`
   - `learned_images/`

### 🛡️ Proteção Automática via .gitignore
O projeto está configurado para **automaticamente excluir** arquivos temporários de commits:

```gitignore
# .gitignore configuration
attached_assets/*           # Exclui todos os arquivos
!attached_assets/*/         # Permite subpastas
!attached_assets/*/.gitkeep # Permite .gitkeep sentinels
```

Isso significa que:
- ✅ Arquivos temporários **nunca são commitados** automaticamente
- ✅ Subpastas vazias **sempre ficam versionadas** via .gitkeep
- ✅ Estrutura do repositório **permanece consistente** entre clones

### 📊 Output Exemplo
```bash
🧹 Cleaning attached_assets directory...
📊 Files before cleanup: 54
📊 Files after cleanup: 4
📁 Preserved directory structure:
attached_assets
attached_assets/generated_images
attached_assets/learned_images
attached_assets/chat_images
attached_assets/stock_images
✅ Cleanup complete! Removed 50 files.
```

### 🔒 Segurança
- **Nenhuma operação destrutiva** fora do diretório `attached_assets/`
- **Preserva .gitkeep files** para manter versionamento de subpastas
- **Logs detalhados** de todas as operações executadas
- **Exit code 0** em caso de sucesso

### 🔧 Quando Usar
- **Antes de commits importantes**: Limpar assets temporários não versionados
- **Após testes extensivos**: Remover imagens/arquivos gerados durante desenvolvimento
- **Manutenção periódica**: Liberar espaço em disco removendo arquivos acumulados
- **Troubleshooting**: Reset completo dos assets para estado inicial limpo

### ⚠️ Notas Importantes
1. O script é **idempotente** - pode ser executado múltiplas vezes sem efeitos colaterais
2. Arquivos dentro de `attached_assets/` **não são versionados** por padrão (.gitignore)
3. Para versionar um arquivo específico, use `git add -f attached_assets/file.ext`

---

## Outras ferramentas futuras

- `scripts/backup-database.ts` - Backup completo do DB
- `scripts/migrate-data.ts` - Migração de dados antigos
- `scripts/cleanup-orphans.ts` - Limpeza de registros órfãos

---
**Mantido por**: AION Development Team  
**Última atualização**: Novembro 2025
