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
  
  // Parse predictions & reactions to detect patterns
  const predictions = [];
  const reactions = [];
  const hotTakes = [];
  
  memories.forEach(m => {
    const text = m.text || '';
    if (text.includes('[PREDICTION')) {
      const matchMatch = text.match(/Match:\s*([^|]+)/);
      const pickMatch = text.match(/Picked:\s*([^|]+)/);
      const matchStr = matchMatch ? matchMatch[1].trim() : 'a match';
      const pickStr = pickMatch ? pickMatch[1].trim() : '';
      predictions.push({ match: matchStr, pick: pickStr, text });
    } else if (text.includes('[REACTION')) {
      reactions.push(text);
    } else if (text.includes('[HOT TAKE')) {
      hotTakes.push(text);
    }
  });

  if (agentKey === 'optimist') {
    if (count === 0) {
      return "Welcome to the War Room! 🌟 I am The Believer, and I cannot wait to see your predictions! Go ahead and log your first match pick — I am sure your instincts are spot on!";
    }
    
    let text = `Hey there, passion-fueled fan! 🌟 We've got ${count} memories stored on Walrus Mainnet. `;
    if (predictions.length > 0) {
      const lastPred = predictions[predictions.length - 1];
      text += `I love your confidence in picking ${lastPred.pick || 'your team'} for the ${lastPred.match} game! You always back your teams with such pure enthusiasm. `;
    }
    if (reactions.length > 0) {
      text += `Even when results don't go our way, you keep the faith. `;
    }
    
    const scoreVal = Math.min(10, 6 + Math.ceil(predictions.length / 2));
    text += `\n\nOptimism Score: Glass Half Full ${scoreVal}/10`;
    return text;
  }
  
  if (agentKey === 'skeptic') {
    if (count === 0) {
      return "The Realist here. 🧊 I'm watching. You have zero predictions logged, which is probably smart, because once you commit to paper, I'll dismantle your logic piece by piece.";
    }
    
    let text = `Oh boy, here we go. 🧊 I reviewed your ${count} memories. `;
    if (predictions.length > 0) {
      const firstPred = predictions[0];
      const lastPred = predictions[predictions.length - 1];
      text += `Remember when you claimed "${firstPred.pick}" for ${firstPred.match}? `;
      if (predictions.length > 1) {
        text += `And now you're jumping on ${lastPred.pick || 'another team'} for ${lastPred.match}. `;
      }
      text += `It's fascinating how confidence scales inversely with actual results. `;
    }
    if (hotTakes.length > 0) {
      text += `Your hot takes are like milk in the sun — souring within 24 hours. `;
    }
    
    const credVal = Math.max(1, 9 - Math.ceil(predictions.length / 2));
    text += `\n\nCredibility Score: Wishful Thinking ${credVal}/10`;
    return text;
  }
  
  if (count === 0) {
    return "No profile available. I need at least one prediction or reaction logged in Walrus Memory to parse your psychological fan archetype.";
  }
  
  let text = `Fan Profile Dossier (Offline Parser):\n`;
  text += `This user has accumulated ${count} tournament memories. Analysis indicates a strong tendency to `;
  if (predictions.length > 2) {
    text += `consistently back heavy favorites while reacting with shock and denial when upsets occur. `;
  } else {
    text += `formulate strong opinions on matches early in the tournament. `;
  }
  
  if (hotTakes.length > 0) {
    text += `They exhibit a high frequency of emotional 'hot takes' which are quickly contradicted by subsequent match reactions. `;
  }
  
  text += `\n\nFan Archetype: The Hopeless Romantic`;
  return text;
}

const fallbackMatches = [
  {
    id: "760415",
    date: "2026-06-11T19:00Z",
    name: "South Africa at Mexico",
    shortName: "RSA @ MEX",
    status: "STATUS_SCHEDULED",
    state: "pre",
    statusDetail: "Thu, June 11th at 3:00 PM EDT",
    home: { name: "Mexico", shortName: "MEX", logo: "https://a.espncdn.com/i/teamlogos/countries/500/mex.png", score: "0" },
    away: { name: "South Africa", shortName: "RSA", logo: "https://a.espncdn.com/i/teamlogos/countries/500/rsa.png", score: "0" }
  },
  {
    id: "760416",
    date: "2026-06-12T16:00Z",
    name: "Canada vs Morocco",
    shortName: "CAN vs MAR",
    status: "STATUS_SCHEDULED",
    state: "pre",
    statusDetail: "Fri, June 12th at 12:00 PM EDT",
    home: { name: "Canada", shortName: "CAN", logo: "https://a.espncdn.com/i/teamlogos/countries/500/can.png", score: "0" },
    away: { name: "Morocco", shortName: "MAR", logo: "https://a.espncdn.com/i/teamlogos/countries/500/mar.png", score: "0" }
  },
  {
    id: "760417",
    date: "2026-06-12T20:00Z",
    name: "United States vs Spain",
    shortName: "USA vs ESP",
    status: "STATUS_SCHEDULED",
    state: "pre",
    statusDetail: "Fri, June 12th at 4:00 PM EDT",
    home: { name: "United States", shortName: "USA", logo: "https://a.espncdn.com/i/teamlogos/countries/500/usa.png", score: "0" },
    away: { name: "Spain", shortName: "ESP", logo: "https://a.espncdn.com/i/teamlogos/countries/500/esp.png", score: "0" }
  },
  {
    id: "760418",
    date: "2026-06-13T15:00Z",
    name: "Argentina vs Saudi Arabia",
    shortName: "ARG vs KSA",
    status: "STATUS_SCHEDULED",
    state: "pre",
    statusDetail: "Sat, June 13th at 11:00 AM EDT",
    home: { name: "Argentina", shortName: "ARG", logo: "https://a.espncdn.com/i/teamlogos/countries/500/arg.png", score: "0" },
    away: { name: "Saudi Arabia", shortName: "KSA", logo: "https://a.espncdn.com/i/teamlogos/countries/500/ksa.png", score: "0" }
  },
  {
    id: "760419",
    date: "2026-06-13T19:00Z",
    name: "Brazil vs Serbia",
    shortName: "BRA vs SRB",
    status: "STATUS_SCHEDULED",
    state: "pre",
    statusDetail: "Sat, June 13th at 3:00 PM EDT",
    home: { name: "Brazil", shortName: "BRA", logo: "https://a.espncdn.com/i/teamlogos/countries/500/bra.png", score: "0" },
    away: { name: "Serbia", shortName: "SRB", logo: "https://a.espncdn.com/i/teamlogos/countries/500/srb.png", score: "0" }
  },
  {
    id: "760420",
    date: "2026-06-14T18:00Z",
    name: "France vs Australia",
    shortName: "FRA vs AUS",
    status: "STATUS_SCHEDULED",
    state: "pre",
    statusDetail: "Sun, June 14th at 2:00 PM EDT",
    home: { name: "France", shortName: "FRA", logo: "https://a.espncdn.com/i/teamlogos/countries/500/fra.png", score: "0" },
    away: { name: "Australia", shortName: "AUS", logo: "https://a.espncdn.com/i/teamlogos/countries/500/aus.png", score: "0" }
  },
  {
    id: "760421",
    date: "2026-06-15T17:00Z",
    name: "Germany vs Japan",
    shortName: "GER vs JPN",
    status: "STATUS_SCHEDULED",
    state: "pre",
    statusDetail: "Mon, June 15th at 1:00 PM EDT",
    home: { name: "Germany", shortName: "GER", logo: "https://a.espncdn.com/i/teamlogos/countries/500/ger.png", score: "0" },
    away: { name: "Japan", shortName: "JPN", logo: "https://a.espncdn.com/i/teamlogos/countries/500/jpn.png", score: "0" }
  },
  {
    id: "760422",
    date: "2026-06-15T21:00Z",
    name: "England vs Iran",
    shortName: "ENG vs IRN",
    status: "STATUS_SCHEDULED",
    state: "pre",
    statusDetail: "Mon, June 15th at 5:00 PM EDT",
    home: { name: "England", shortName: "ENG", logo: "https://a.espncdn.com/i/teamlogos/countries/500/eng.png", score: "0" },
    away: { name: "Iran", shortName: "IRN", logo: "https://a.espncdn.com/i/teamlogos/countries/500/irn.png", score: "0" }
  }
];

let cachedMatches = null;
let lastCacheTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

app.get('/api/matches', async (req, res) => {
  const now = Date.now();
  if (cachedMatches && (now - lastCacheTime < CACHE_DURATION)) {
    return res.json({ matches: cachedMatches, source: 'cache' });
  }

  try {
    const response = await fetch('https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20260611-20260719&limit=150');
    if (!response.ok) {
      throw new Error(`ESPN API returned status ${response.status}`);
    }
    const data = await response.json();
    const events = data.events || [];
    
    if (events.length === 0) {
      throw new Error('No events returned from ESPN scoreboard');
    }

    const mapped = events.map(e => {
      const comp = e.competitions?.[0] || {};
      const competitors = comp.competitors || [];
      const home = competitors.find(c => c.homeAway === 'home') || {};
      const away = competitors.find(c => c.homeAway === 'away') || {};
      
      return {
        id: e.id,
        date: e.date,
        name: e.name,
        shortName: e.shortName,
        status: comp.status?.type?.name || 'STATUS_SCHEDULED',
        state: comp.status?.type?.state || 'pre',
        statusDetail: comp.status?.type?.detail || 'Scheduled',
        home: {
          name: home.team?.displayName || 'TBD',
          shortName: home.team?.abbreviation || 'TBD',
          logo: home.team?.logo || 'https://a.espncdn.com/i/teamlogos/countries/500/default-flag.png',
          score: home.score || '0'
        },
        away: {
          name: away.team?.displayName || 'TBD',
          shortName: away.team?.abbreviation || 'TBD',
          logo: away.team?.logo || 'https://a.espncdn.com/i/teamlogos/countries/500/default-flag.png',
          score: away.score || '0'
        }
      };
    });

    cachedMatches = mapped;
    lastCacheTime = now;
    res.json({ matches: mapped, source: 'live' });
  } catch (err) {
    console.warn('Error fetching World Cup matches from ESPN:', err.message);
    res.json({ matches: fallbackMatches, source: 'fallback', error: err.message });
  }
});

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
