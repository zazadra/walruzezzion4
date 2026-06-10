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

// ─── CONFIGURATION & CREDENTIALS ──────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const NAMESPACE = 'walruzezzion4-oracle';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
const WALRUS_MEMORY_API_KEY = process.env.WALRUS_MEMORY_API_KEY || process.env.MEMWAL_DELEGATE_KEY;
const WALRUS_ACCOUNT_ID = process.env.MEMWAL_ACCOUNT_ID;
const RELAYER_URL = process.env.MEMWAL_RELAYER_URL || 'https://relayer.memory.walrus.xyz';

console.log(`\n⚽ Walruzezzion4 Backend`);
console.log(`   Gemini API Key: ${GEMINI_API_KEY ? '✅ Configured' : '❌ Missing'}`);
console.log(`   Walrus Memory Key: ${WALRUS_MEMORY_API_KEY ? '✅ Configured' : '❌ Missing'}`);
console.log(`   Walrus Account ID: ${WALRUS_ACCOUNT_ID || '❌ Missing'}`);

// ─── INITIALIZE CLIENTS ──────────────────────────────────────────────────────
let memwal = null;
let google = null;

if (WALRUS_MEMORY_API_KEY && WALRUS_ACCOUNT_ID) {
  try {
    memwal = MemWal.create({
      key: WALRUS_MEMORY_API_KEY,
      accountId: WALRUS_ACCOUNT_ID,
      serverUrl: RELAYER_URL,
      namespace: NAMESPACE,
    });
    console.log(`   Walrus: Connected successfully to account ${WALRUS_ACCOUNT_ID.substring(0, 16)}…`);
  } catch (err) {
    console.error(`   Walrus Connection Error:`, err.message);
  }
}

if (GEMINI_API_KEY) {
  try {
    google = createGoogleGenerativeAI({ apiKey: GEMINI_API_KEY });
    console.log(`   Gemini AI: Connected successfully`);
  } catch (err) {
    console.error(`   Gemini Connection Error:`, err.message);
  }
}

// ─── HELPER FOR SENTIMENT ANALYSIS ───────────────────────────────────────────
async function analyzeSentiment(text) {
  if (!google) return 'NEUTRAL';
  try {
    const { text: sentiment } = await generateText({
      model: google('gemini-1.5-flash'),
      system: 'You are a sentiment classifier. Respond with exactly one word in uppercase: POSITIVE, NEGATIVE, NEUTRAL, OPTIMISTIC, or SKEPTICAL. Do not add punctuation or explanation.',
      prompt: `Analyze the sentiment of this message: "${text}"`,
    });
    return sentiment.trim().toUpperCase();
  } catch (err) {
    console.error('Sentiment Analysis Error:', err.message);
    return 'NEUTRAL';
  }
}

// ─── ROUTES ───────────────────────────────────────────────────────────────────

// Health & Status Check
app.get('/api/health', async (req, res) => {
  let walrusStatus = 'not_configured';
  if (memwal) {
    try {
      await memwal.health();
      walrusStatus = 'connected';
    } catch {
      walrusStatus = 'error';
    }
  }
  res.json({
    walrus: walrusStatus,
    ai: !!google,
    accountId: WALRUS_ACCOUNT_ID,
    namespace: NAMESPACE,
  });
});

// Tab 1: Chat endpoint (The Oracle)
app.post('/api/chat', async (req, res) => {
  const { message } = req.body;
  if (!message?.trim()) {
    return res.status(400).json({ error: 'Message is required' });
  }

  if (!google) {
    return res.status(500).json({ error: 'Gemini AI API key is not configured' });
  }

  try {
    // 1. Determine sentiment
    const sentiment = await analyzeSentiment(message);

    // 2. Fetch past context from Walrus to inject into Oracle memory
    let pastContext = '';
    if (memwal) {
      try {
        const recalled = await memwal.recall({ query: message, limit: 10 });
        if (recalled?.results?.length > 0) {
          pastContext = recalled.results.map(r => `• ${r.text}`).join('\n');
        }
      } catch (err) {
        console.warn('Could not retrieve context from Walrus:', err.message);
      }
    }

    // 3. System Prompt for Oracle
    const systemPrompt = `You are "The Oracle" — an advanced AI pundit and strategic match analyst for the FIFA World Cup. 
Your tone is intelligent, engaging, and authoritative, with a touch of wit.
You remember everything the user tells you. Quote their past claims back to them if relevant to call out contradictions or agree with their evolution.
Keep your responses concise and impactful — maximum 2-3 sentences.`;

    const promptWithContext = message + (pastContext ? `\n\n[RECALLED CONTEXT FROM WALRUS MEMORY]:\n${pastContext}` : '');

    // 4. Generate response from Gemini
    const { text: aiResponse } = await generateText({
      model: google('gemini-1.5-flash'),
      system: systemPrompt,
      prompt: promptWithContext,
    });

    // 5. Store conversation details asynchronously in Walrus Memory
    if (memwal) {
      const userMemory = `[CHAT | Sentiment: ${sentiment}] User: "${message}"`;
      const oracleMemory = `[ORACLE | Response] Oracle: "${aiResponse}"`;
      
      memwal.remember(userMemory).catch(err => console.error('Failed to log User chat to Walrus:', err.message));
      memwal.remember(oracleMemory).catch(err => console.error('Failed to log Oracle response to Walrus:', err.message));
    }

    res.json({ response: aiResponse });
  } catch (err) {
    console.error('Chat endpoint error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Tab 2: Predict endpoint
app.post('/api/predict', async (req, res) => {
  const { matchName, chosenTeam } = req.body;
  if (!matchName || !chosenTeam) {
    return res.status(400).json({ error: 'matchName and chosenTeam are required' });
  }

  if (!memwal) {
    return res.status(500).json({ error: 'Walrus Memory API key is not configured' });
  }

  const timestamp = new Date().toISOString();
  const predictionMemory = `[PREDICTION | ${timestamp}] Match: ${matchName} | Picked: ${chosenTeam}`;

  try {
    const job = await memwal.remember(predictionMemory);
    res.json({
      success: true,
      jobId: job.job_id,
      storedText: predictionMemory
    });
  } catch (err) {
    console.error('Prediction log error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Tab 3: Signals endpoint (Evolution brief)
app.get('/api/signals', async (req, res) => {
  if (!memwal) {
    return res.status(500).json({ error: 'Walrus Memory API key is not configured' });
  }
  if (!google) {
    return res.status(500).json({ error: 'Gemini AI API key is not configured' });
  }

  try {
    // 1. Recall historical memories
    const recalled = await memwal.recall({
      query: 'World Cup chats predictions sentiment reactions hot takes',
      limit: 50
    });

    const memoriesList = (recalled?.results || []).map(r => r.text || '');
    if (memoriesList.length === 0) {
      return res.json({
        insight: "Your Walrus memory ledger is currently blank. Start chatting with The Oracle or log predictions under 'Predict' to construct your evolving fan profile.",
        memoriesCount: 0
      });
    }

    // 2. Format memories context
    const contextText = memoriesList.map(m => `• ${m}`).join('\n');

    // 3. System prompt for evolution analysis
    const systemPrompt = `You are a World Cup Fan Psychologist and Analyst. 
Analyze the user's historical predictions and chat memories recorded on the blockchain (Walrus Memory).
Write a 1-2 paragraph "Memory Insight" outlining:
1. Their overall bias (e.g., backing favorites, optimistic underdogs, emotional flip-flopping).
2. How their views or opinions have evolved throughout the tournament based on the chat logs.
3. Be analytical, engaging, and direct. Do not use markdown headers, bold headers, or bullet points. Write 1-2 paragraphs of continuous prose.`;

    const promptText = `Analyze the following memory logs retrieved from the user's ledger and provide their fan evolution dossier:\n\n${contextText}`;

    // 4. Generate completions
    const { text: insight } = await generateText({
      model: google('gemini-1.5-flash'),
      system: systemPrompt,
      prompt: promptText,
    });

    res.json({
      insight,
      memoriesCount: memoriesList.length
    });
  } catch (err) {
    console.error('Signals endpoint error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Live Match Schedule ESPN API
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
  }
];

let cachedMatches = null;
let lastCacheTime = 0;
const CACHE_DURATION = 5 * 60 * 1000;

app.get('/api/matches', async (req, res) => {
  const now = Date.now();
  if (cachedMatches && (now - lastCacheTime < CACHE_DURATION)) {
    return res.json({ matches: cachedMatches });
  }

  try {
    const response = await fetch('https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20260611-20260719&limit=150');
    if (!response.ok) throw new Error(`ESPN API returned status ${response.status}`);
    const data = await response.json();
    const events = data.events || [];

    if (events.length === 0) throw new Error('No events found');

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
    res.json({ matches: mapped });
  } catch (err) {
    console.warn('Using fallback match list due to fetch error:', err.message);
    res.json({ matches: fallbackMatches });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server listening on http://localhost:${PORT}`);
});
