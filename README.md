# ⚽ Walruzezzion4 — FIFA World Cup 2026 AI War Room

> *"Two AI agents remember every prediction you've ever made. By Day 4 they know you better than you know yourself."*

**Built for [Walrus Sessions 4](https://mystenlabs.notion.site/Walrus-Session-4-3756d9dcb4e9808ca16fc8c22562e3c6) · Powered by [Walrus Memory](https://walrus.xyz/products/walrus-memory)**

🔗 **Repo:** https://github.com/zazadra/walruzezzion4

---

## What It Does

The War Room is a multi-agent AI football pundit that builds a persistent profile of a fan throughout the FIFA World Cup 2026.

**Two agents share a common memory layer (Walrus Memory on Mainnet):**

| Agent | Personality | Role |
|-------|-------------|------|
| 🌟 **The Believer** | Eternal optimist | Finds the silver lining in every bad prediction |
| 🧊 **The Realist** | Brutally honest analyst | Surgically dissects your contradictions |
| 🔍 **The Profiler** | Psychological profiler | Builds your fan archetype over time |

**As the tournament progresses, agents get sharper because they remember:**
- Day 1: "Tell me your predictions…"  
- Day 4+: *"On June 14 you said Brazil would win '3-0 minimum'. They drew 1-1. Then you called Mbappe overrated — and immediately predicted France to win the tournament. Credibility Score: 2/10."*

---

## How Walrus Memory Is Used

Every prediction, hot take, and reaction is stored as a memory via `memwal.remember(text)`. Before each debate or profile analysis, agents call `memwal.recall({ query, limit })` to semantically retrieve the most relevant past memories. This means responses are never generated in isolation — the agents actively consult the Walrus Memory layer to ground their analysis in your actual history.

Memory persists across sessions, devices, and browsers — because it lives on the Walrus network, not local storage.

---

## Setup

### Prerequisites
- Node.js 18+
- Walrus Memory account → [memory.walrus.xyz](https://memory.walrus.xyz)
- Google Gemini API key → [aistudio.google.com](https://aistudio.google.com)

### Install
```bash
npm install
```

### Configure
```bash
cp .env.example .env
# Edit .env with your keys
```

Required in `.env`:
```env
MEMWAL_DELEGATE_KEY=your-ed25519-private-key
MEMWAL_ACCOUNT_ID=your-memwal-account-object-id
GOOGLE_GENERATIVE_AI_API_KEY=your-gemini-api-key
```

### Run
```bash
node server.js
# → http://localhost:3000
```

**Demo mode** (no keys needed): The app runs with local in-memory storage so you can explore the UI without any configuration.

---

## Features

### 🧠 Core Memory Features
- **Persistent Memory**: All memories stored on Walrus Mainnet via `@mysten-incubation/memwal`
- **Semantic Recall**: Agents use natural language queries to retrieve relevant past predictions
- **Memory Timeline**: Full chronological view of everything you've logged
- **Tournament Phases**: Memory accumulates across the full 4-week tournament

### 🤖 Multi-Agent War Room
- **Parallel Debate**: Both agents analyse your history simultaneously via shared Walrus Memory
- **Fan Profiling**: The Profiler builds a psychological archetype based on your prediction patterns

### 📼 Before/After Demo
- Inject pre-written "past memories" for Day 1, Day 4, and Finals Week to simulate memory growth
- See how agent responses change as context accumulates

### ⚡ Demo Mode
Run without any API keys — local in-memory storage lets you explore the full UI experience.

---

## Architecture

```
Browser
  └── Express Server (Node.js)
        ├── POST /api/remember  → memwal.remember(text)
        ├── POST /api/recall    → memwal.recall({ query, limit })
        ├── GET  /api/memories  → memwal.recall(broad query)
        ├── POST /api/debate    → recall → parallel Gemini calls
        └── POST /api/profile   → recall → Gemini profile analysis
```

---

## Memory Format

Memories are stored as structured text for reliable semantic retrieval:

```
[PREDICTION | Jun 14, 2026] Match: Brazil vs Serbia | Picked: Brazil 3-0 | Confidence: 9/10 | "Brazil will absolutely dominate"
[REACTION | Jun 15, 2026] After Brazil vs Serbia (1-1 Draw) | "HOW did they only draw? The ref was corrupt!"
[HOT TAKE | Jun 16, 2026] "Mbappe is massively overrated"
```

---

## Submission Checklist (Walrus Sessions 4)

- [x] Walrus Memory integrated (`@mysten-incubation/memwal@0.0.7`)
- [x] Live on Walrus Mainnet (with keys configured)
- [x] Before/after demonstration built in
- [x] Multi-agent coordination through shared memory layer
- [x] Public repo

---

## Tech Stack
- **Memory**: `@mysten-incubation/memwal` on Walrus Mainnet
- **AI**: Google Gemini 2.0 Flash via `@ai-sdk/google`
- **Backend**: Express.js
- **Frontend**: Vanilla HTML/CSS/JS (no framework needed)
