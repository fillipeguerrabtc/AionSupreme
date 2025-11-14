import { OpenAI } from 'openai';
import pkg from 'pg';
const { Client } = pkg;
import { truncateForEmbedding } from './ai/embedding-sanitizer';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function generateEmbeddings() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  
  // Buscar documentos sem embeddings
  const docs = await client.query(`
    SELECT d.id, d.content
    FROM documents d
    LEFT JOIN embeddings e ON d.id = e.document_id
    WHERE d.id IN (113, 114, 115) AND e.id IS NULL
  `);
  
  console.log(`Gerando embeddings para ${docs.rows.length} documentos...`);
  
  for (const doc of docs.rows) {
    console.log(`Processando documento ${doc.id}...`);
    
    // Dividir em chunks (simplificado - 1 chunk por documento)
    const chunks = [doc.content];
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      
      // ✅ CRITICAL: Truncate to prevent "maximum context length 8192 tokens" error
      const safeChunk = truncateForEmbedding(chunk, { purpose: 'generate-embeddings.ts script' });
      
      // Gerar embedding
      const response = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: safeChunk,
      });
      
      const embedding = response.data[0].embedding;
      
      // Inserir embedding (FIX: usar Math.floor para tokens)
      await client.query(`
        INSERT INTO embeddings (document_id, chunk_index, chunk_text, chunk_tokens, embedding, embedding_dim)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [doc.id, i, safeChunk, Math.floor(safeChunk.length / 4), JSON.stringify(embedding), 1536]);
      
      console.log(`  ✓ Embedding criado para chunk ${i}`);
    }
  }
  
  console.log('✅ Todos os embeddings criados!');
  await client.end();
}

generateEmbeddings().catch(console.error);
