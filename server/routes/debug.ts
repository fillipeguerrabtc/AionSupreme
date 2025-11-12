import { Router } from "express";
import { requireAdmin } from "../middleware/auth";
import log from "../utils/logger";

const router = Router();

router.post("/test-free-apis", requireAdmin, async (req, res) => {
  const results: Record<string, any> = {};

  // Test Groq
  try {
    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) {
      results.groq = { error: "GROQ_API_KEY not set" };
    } else {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: 'Test' }],
          max_tokens: 10
        })
      });

      if (!response.ok) {
        const error = await response.text();
        results.groq = { 
          status: response.status, 
          error,
          headers: Object.fromEntries(response.headers.entries())
        };
      } else {
        const data = await response.json();
        results.groq = { 
          status: 200, 
          success: true,
          tokensUsed: data.usage?.total_tokens,
          headers: Object.fromEntries(response.headers.entries())
        };
      }
    }
  } catch (error: any) {
    results.groq = { error: error.message };
  }

  // Test Gemini
  try {
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      results.gemini = { error: "GEMINI_API_KEY not set" };
    } else {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(geminiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
      const result = await model.generateContent('Test');
      const response = await result.response;
      results.gemini = { 
        status: 200, 
        success: true,
        text: response.text().substring(0, 50)
      };
    }
  } catch (error: any) {
    results.gemini = { error: error.message, stack: error.stack };
  }

  // Test HuggingFace
  try {
    const hfKey = process.env.HUGGINGFACE_API_KEY;
    if (!hfKey) {
      results.huggingface = { error: "HUGGINGFACE_API_KEY not set" };
    } else {
      const response = await fetch(
        'https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${hfKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            inputs: 'Test',
            parameters: { max_new_tokens: 10 }
          })
        }
      );

      if (!response.ok) {
        const error = await response.text();
        results.huggingface = { 
          status: response.status, 
          error,
          headers: Object.fromEntries(response.headers.entries())
        };
      } else {
        const data = await response.json();
        results.huggingface = { 
          status: 200, 
          success: true,
          response: Array.isArray(data) ? data[0]?.generated_text?.substring(0, 50) : JSON.stringify(data).substring(0, 100)
        };
      }
    }
  } catch (error: any) {
    results.huggingface = { error: error.message };
  }

  // Test OpenRouter
  try {
    const orKey = process.env.OPEN_ROUTER_API_KEY;
    if (!orKey) {
      results.openrouter = { error: "OPEN_ROUTER_API_KEY not set" };
    } else {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${orKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.REPLIT_DEPLOYMENT_URL || 'http://localhost:5000',
          'X-Title': 'AION Supreme'
        },
        body: JSON.stringify({
          model: 'meta-llama/llama-3.1-8b-instruct:free',
          messages: [{ role: 'user', content: 'Test' }],
          max_tokens: 10
        })
      });

      if (!response.ok) {
        const error = await response.text();
        results.openrouter = { 
          status: response.status, 
          error,
          headers: Object.fromEntries(response.headers.entries())
        };
      } else {
        const data = await response.json();
        results.openrouter = { 
          status: 200, 
          success: true,
          tokensUsed: data.usage?.total_tokens
        };
      }
    }
  } catch (error: any) {
    results.openrouter = { error: error.message };
  }

  log.info({ results }, "Debug: Free APIs test results");
  res.json({ success: true, results });
});

export default router;
