import { OpenAI } from 'openai';
import pkg from 'pg';
const { Client } = pkg;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function generateEmbeddings() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  
  // Buscar documentos sem embeddings
  const docs = await client.query(`
    SELECT d.id, d.content, d.tenant_id
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
      
      // Gerar embedding
      const response = await openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: chunk,
      });
      
      const embedding = response.data[0].embedding;
      
      // Inserir embedding (FIX: usar Math.floor para tokens)
      await client.query(`
        INSERT INTO embeddings (document_id, tenant_id, chunk_index, chunk_text, chunk_tokens, embedding, embedding_dim)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [doc.id, doc.tenant_id, i, chunk, Math.floor(chunk.length / 4), JSON.stringify(embedding), 1536]);
      
      console.log(`  ✓ Embedding criado para chunk ${i}`);
    }
  }
  
  console.log('✅ Todos os embeddings criados!');
  await client.end();
}

generateEmbeddings().catch(console.error);
