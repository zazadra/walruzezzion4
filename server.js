import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { MemWal } from '@mysten-incubation/memwal';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText } from 'ai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const DEMO_MODE = process.env.DEMO_MODE === 'true' || !process.env.MEMWAL_DELEGATE_KEY || process.env.MEMWAL_DELEGATE_KEY === 'your-ed25519-private-key-here';
const PORT = process.env.PORT || 3000;
const NAMESPACE = 'wc2026-pundit';

console.log(`\n⚽ The Walrus — World Cup War Room`);
console.log(`   Mode: ${DEMO_MODE ? '🎭 DEMO (local memory)' : '🔗 LIVE (Walrus mainnet)'}`);

// ─── WALRUS MEMORY CLIENT ─────────────────────────────────────────────────────
let memwal = null;
let walrusAccountId = null;

if (!DEMO_MODE) {
  try {
    memwal = MemWal.create({
      key: process.env.MEMWAL_DELEGATE_KEY,
      accountId: process.env.MEMWAL_ACCOUNT_ID,
      serverUrl: process.env.MEMWAL_RELAYER_URL || 'https://relayer.memory.walrus.xyz',
      namespace: NAMESPACE,
    });
    walrusAccountId = process.env.MEMWAL_ACCOUNT_ID;
    console.log(`   Walrus: ✅ Connected (account: ${walrusAccountId?.substring(0, 16)}…)`);
  } catch (err) {
    console.error(`   Walrus: ❌ ${err.message} — falling back to demo`);
  }
}

// ─── IN-MEMORY DEMO STORE ────────────────────────────────────────────────────
const demoStore = [];

// ─── GEMINI AI ────────────────────────────────────────────────────────────────
let google = null;
if (process.env.GOOGLE_GENERATIVE_AI_API_KEY && process.env.GOOGLE_GENERATIVE_AI_API_KEY !== 'your-gemini-api-key-here') {
  google = createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY });
  console.log(`   AI:     ✅ Gemini connected`);
} else {
  console.log(`   AI:     ⚠️  No Gemini key — using template responses`);
}

console.log('');

// ─── AGENT PERSONAS ───────────────────────────────────────────────────────────
const AGENTS = {
  optimist: {
    name: 'The Believer',
    emoji: '🌟',
    style: `You are "The Believer" — an eternal optimist football pundit who always finds the silver lining. 
You have a warm, enthusiastic style but you're not stupid — you call out genuine mistakes.
When recalling memories, you quote the user's EXACT past predictions back at them with gentle ribbing.
You end your analysis with an "Optimism Score" (e.g., "Optimism Score: Glass Half Full 7/10").
Keep responses punchy — 2-3 sentences max.`,
  },
  skeptic: {
    name: 'The Realist',
    emoji: '🧊',
    style: `You are "The Realist" — a brutally honest, cold-eyed football analyst who never lets sentiment cloud judgment.
You are sharp, cutting, and occasionally funny. You love catching contradictions.
When recalling memories, you quote the user's EXACT past predictions with surgical precision and mockery.
You end your analysis with a "Credibility Score" (e.g., "Credibility Score: Wishful Thinking 3/10").
Keep responses punchy — 2-3 sentences max.`,
  },
  fanProfiler: {
    name: 'The Profiler',
    emoji: '🔍',
    style: `You are "The Profiler" — an AI that builds psychological profiles of football fans based on their prediction history.
You identify biases, blind spots, and recurring patterns.
You speak in the third person about the user ("This fan consistently…").
You end with a "Fan Archetype" classification.
Be insightful and specific — reference actual past predictions when possible.`,
  },
};

// ─── AI GENERATION ────────────────────────────────────────────────────────────
async function generateAgentResponse(agentKey, memories, prompt) {
  const agent = AGENTS[agentKey];
  if (!agent) return { text: 'Unknown agent', agent: agentKey };

  const memCtx = memories.length > 0
    ? `\n\nPAST MEMORIES FROM WALRUS (use these to be specific):\n${memories.map(m => `• "${m.text}" [${m.date || 'unknown'}]`).join('\n')}`
    : '\n\nNo past memories found for this user.';

  if (!google) {
    return { text: generateFallback(agentKey, memories), agent: agentKey, memoriesUsed: memories.length };
  }

  try {
    const { text } = await generateText({
      model: google('gemini-2.0-flash'),
      system: agent.style,
      prompt: prompt + memCtx,
    });
    return { text, agent: agentKey, memoriesUsed: memories.length };
  } catch (err) {
    console.error(`Gemini error (${agentKey}):`, err.message);
    return { text: generateFallback(agentKey, memories), agent: agentKey, memoriesUsed: memories.length };
  }
}

function generateFallback(agentKey, memories) {
  const count = memories.length;
  if (agentKey === 'optimist') {
    if (count === 0) return "First session! Tell me everything — I believe in you already. 🌟";
    return `You've made ${count} predictions! Some were a bit… optimistic, but your passion is undeniable. Optimism Score: Unbreakable Spirit 8/10.`;
  }
  if (agentKey === 'skeptic') {
    if (count === 0) return "First session. I'm watching. I'm always watching. 🧊";
    return `${count} predictions on file. Your track record suggests more hope than analysis. Credibility Score: Enthusiastic Amateur 4/10.`;
  }
  if (count === 0) return "No prediction history yet. Build up a record and I'll tell you exactly who you are as a fan.";
  const predictions = memories.filter(m => m.type === 'prediction' || m.text?.includes('PREDICTION'));
  return `Fan Archetype: The Eternal Optimist. ${predictions.length} predictions logged. Pattern detected: consistently overestimates your preferred team's abilities while underestimating tactical deficiencies.`;
}

// ─── ROUTES ───────────────────────────────────────────────────────────────────

// Status
app.get('/api/health', async (req, res) => {
  let walrusStatus = DEMO_MODE ? 'demo' : 'not_configured';
  if (memwal) {
    try {
      await memwal.health();
      walrusStatus = 'connected';
    } catch { walrusStatus = 'error'; }
  }
  res.json({
    mode: DEMO_MODE ? 'demo' : 'live',
    walrus: walrusStatus,
    ai: !!google,
    accountId: walrusAccountId,
    namespace: NAMESPACE,
  });
});

// Remember
app.post('/api/remember', async (req, res) => {
  const { text, type = 'general', match, team, confidence } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'text required' });

  const timestamp = new Date().toISOString();
  const formatted = formatMemoryText({ text: text.trim(), type, match, team, confidence, timestamp });

  if (DEMO_MODE || !memwal) {
    const entry = {
      id: `demo_${Date.now()}`,
      text: formatted,
      raw: text.trim(),
      type, match, team, confidence, timestamp,
      mode: 'demo',
    };
    demoStore.push(entry);
    return res.json({ success: true, mode: 'demo', stored_text: formatted });
  }

  try {
    const job = await memwal.remember(formatted);
    res.json({
      success: true,
      mode: 'live',
      job_id: job.job_id,
      stored_text: formatted,
      account_id: walrusAccountId,
      explorer_url: `https://suiscan.xyz/mainnet/object/${walrusAccountId}`,
    });
  } catch (err) {
    console.error('remember():', err.message);
    // Fallback to demo store on error
    const entry = { id: `fallback_${Date.now()}`, text: formatted, raw: text.trim(), type, match, team, confidence, timestamp, mode: 'fallback' };
    demoStore.push(entry);
    res.json({ success: true, mode: 'fallback', stored_text: formatted, error: err.message });
  }
});

// Wait for job
app.get('/api/job/:jobId', async (req, res) => {
  if (DEMO_MODE || !memwal) return res.json({ status: 'complete', mode: 'demo' });
  try {
    await memwal.waitForRememberJob(req.params.jobId, { timeoutMs: 5000 });
    res.json({ status: 'complete' });
  } catch {
    res.json({ status: 'pending' });
  }
});

// Recall
app.post('/api/recall', async (req, res) => {
  const { query, limit = 15 } = req.body;
  if (!query) return res.status(400).json({ error: 'query required' });

  if (DEMO_MODE || !memwal) {
    const results = demoStore
      .slice(-50)
      .map(m => ({ text: m.text, score: Math.random() * 0.3 + 0.7, timestamp: m.timestamp, type: m.type, date: formatDate(m.timestamp) }))
      .slice(0, limit);
    return res.json({ results, mode: 'demo', count: results.length });
  }

  try {
    const r = await memwal.recall({ query, limit });
    const results = (r.results || []).map(m => ({
      text: m.text || '',
      score: 1 - (m.distance || 0), // convert distance to similarity score
      blob_id: m.blob_id,
      date: 'Walrus mainnet',
    }));
    res.json({ results, mode: 'live', count: results.length });
  } catch (err) {
    console.error('recall():', err.message);
    res.status(500).json({ error: err.message });
  }
});

// All memories (timeline)
app.get('/api/memories', async (req, res) => {
  if (DEMO_MODE || !memwal) {
    return res.json({ memories: demoStore, mode: 'demo', count: demoStore.length });
  }
  try {
    const r = await memwal.recall({ query: 'World Cup prediction opinion reaction hot take tournament', limit: 50 });
    const mems = (r.results || []).map(m => ({
      text: m.text || '',
      blob_id: m.blob_id,
      score: 1 - (m.distance || 0),
      type: detectType(m.text || ''),
    }));
    res.json({ memories: mems, mode: 'live', count: mems.length, accountId: walrusAccountId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Two-agent debate
app.post('/api/debate', async (req, res) => {
  const { topic = 'my World Cup predictions' } = req.body;

  // Recall memories for context
  let memories = await recallMemories(topic, 10);

  const prompt = `The user has been making World Cup predictions. Their topic: "${topic}". Analyse their prediction history and give your verdict.`;

  // Run both agents in parallel
  const [optimistResp, skepticResp] = await Promise.all([
    generateAgentResponse('optimist', memories, prompt),
    generateAgentResponse('skeptic', memories, prompt),
  ]);

  res.json({
    optimist: optimistResp,
    skeptic: skepticResp,
    memories_used: memories.length,
    mode: DEMO_MODE ? 'demo' : 'live',
  });
});

// Fan profile analysis
app.post('/api/profile', async (req, res) => {
  let memories = await recallMemories('predictions opinions biases World Cup fan', 20);

  const prompt = `Build a psychological profile of this football fan based on their complete prediction history throughout the World Cup 2026. Identify their biases, blind spots, and recurring patterns.`;

  const resp = await generateAgentResponse('fanProfiler', memories, prompt);

  res.json({
    profile: resp.text,
    memories_used: memories.length,
    mode: DEMO_MODE ? 'demo' : 'live',
  });
});

// Inject demo memories
app.post('/api/demo/inject', async (req, res) => {
  const { memories } = req.body;
  if (!Array.isArray(memories)) return res.status(400).json({ error: 'memories array required' });

  let injected = 0;
  for (const m of memories) {
    const formatted = formatMemoryText(m);
    if (DEMO_MODE || !memwal) {
      demoStore.push({ ...m, id: `inj_${Date.now()}_${injected}`, text: formatted, injected: true });
      injected++;
    } else {
      try {
        await memwal.remember(formatted);
        injected++;
        await new Promise(r => setTimeout(r, 300)); // small delay between requests
      } catch (err) {
        console.error('inject error:', err.message);
        // Store locally as fallback
        demoStore.push({ ...m, id: `inj_fb_${Date.now()}_${injected}`, text: formatted, injected: true });
        injected++;
      }
    }
  }

  res.json({ success: true, injected, mode: DEMO_MODE ? 'demo' : 'live' });
});

// Analyze (extract facts)
app.post('/api/analyze', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text required' });

  if (DEMO_MODE || !memwal) return res.json({ facts: [text], mode: 'demo' });

  try {
    const r = await memwal.analyze(text);
    res.json({ facts: (r.facts || []).map(f => f.text || f), mode: 'live' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── HELPERS ─────────────────────────────────────────────────────────────────

async function recallMemories(query, limit = 10) {
  if (DEMO_MODE || !memwal) {
    return demoStore.slice(-20).map(m => ({
      text: m.text || m.raw || '',
      type: m.type,
      date: m.timestamp ? formatDate(m.timestamp) : 'demo',
    }));
  }
  try {
    const r = await memwal.recall({ query, limit });
    return (r.results || []).map(m => ({
      text: m.text || '',
      blob_id: m.blob_id,
      date: 'Walrus mainnet',
    }));
  } catch { return []; }
}

function formatMemoryText({ text, type, match, team, confidence, timestamp }) {
  const d = formatDate(timestamp || new Date().toISOString());
  if (type === 'prediction' && match) {
    return `[PREDICTION | ${d}] Match: ${match}${team ? ` | Picked: ${team}` : ''}${confidence ? ` | Confidence: ${confidence}/10` : ''} | "${text}"`;
  }
  if (type === 'reaction') {
    return `[REACTION | ${d}]${match ? ` After ${match}` : ''} | "${text}"`;
  }
  if (type === 'hot_take') {
    return `[HOT TAKE | ${d}] "${text}"`;
  }
  return `[NOTE | ${d}] "${text}"`;
}

function formatDate(ts) {
  if (!ts) return 'unknown';
  try { return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return ts; }
}

function detectType(text = '') {
  if (text.includes('[PREDICTION')) return 'prediction';
  if (text.includes('[REACTION')) return 'reaction';
  if (text.includes('[HOT TAKE')) return 'hot_take';
  return 'general';
}

// ─── START ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Running at http://localhost:${PORT}`);
  console.log(`   Open your browser and start making predictions!\n`);
});
