# 🧁 Piece of Cake — Low-Cost Multi-Agent Language Lab

**Piece of Cake** is an AI-powered, full-stack language learning web app that teaches advanced American English idioms in a fun, gamified way. Users see a **literal illustration** of an idiom and must guess which idiom it represents.

Built as part of the **Agentic Architect Sprint 2026**, this project demonstrates a **Dynamic Subagents & Shared Agent Harness** pattern: two specialized AI agents orchestrated by a backend harness, with a global Firestore cache that eliminates redundant AI compute costs.

> \#AgenticArchitect \#GoogleAntigravity

---

## 🤖 The Multi-Agent Architecture

The core insight: **pay for AI once, serve the result forever.**

```
POST /api/shuffle
  → Harness checks Firestore cache
  → Cache HIT  → instant response (~150ms, $0 AI cost) ⚡
  → Cache MISS → spawns two subagents in parallel:
       ├── Gemini 3.1 Flash-Lite  → structured quiz JSON (temperature: 0.0)
       └── Nano Banana 2          → literal illustration image
  → Both results saved to Firestore + GCS
  → Next time the same idiom appears: cache hit, no agents called
```

### The Shared Agent Harness

The Express backend acts as the **harness** — it orchestrates both subagents, manages async state, routes responses, and writes to the shared cache. Each agent has one job and neither knows the other exists:

```ts
const [quiz, imageUrl] = await Promise.all([
  generateQuiz(idiom),          // Gemini 3.1 Flash-Lite
  generateLiteralIllustration(idiom), // Nano Banana 2
]);
```

Both agents run in parallel. Total time equals the slower agent — not the sum of both.

### Why Two Separate Agents?

- **Separation of concerns** — independent failure, independent tuning
- **Parallel execution** — image and quiz generate simultaneously
- **Swappability** — upgrade one model without touching the other
- **Temperature control** — `1.0` for idiom variety, `0.0` for hallucination-free quiz output

### The Cache Makes It Scale

Without cache: AI costs grow linearly with every request.
With Firestore as shared cache: AI calls grow only with unique idioms — not user count.
The more the app is used, the cheaper each request becomes.

---

## 🔄 User Flow

```
User clicks "Start Learning"
  → POST /api/shuffle (harness checks cache, spawns agents if needed)
  → If cached in Firestore → instant result ⚡
  → If not cached → background task starts (both agents run in parallel)
  → Frontend polls /api/status every 1.5s
  → When ready: shows illustration + quiz question
  → User picks an answer → sees ✅ correct / ❌ incorrect + explanation
  → "Shuffle Next Idiom" → repeat
```

---

## 🏗️ Architecture

It's a **monorepo** with two workspaces:

### Backend — Node.js + Express + TypeScript

Three AI-powered services:

| Service | Description |
|---|---|
| `gemini.ts` | Uses **Gemini 3.1 Flash-Lite** to suggest random idioms and generate structured quiz JSON (question, options, correct answer, explanation) |
| `imageGenerator.ts` | Uses **Nano Banana 2** to generate literal illustrations of idioms, saved to Google Cloud Storage |
| `firestore.ts` | **Firestore** shared cache layer — eliminates redundant agent calls across all instances |

API endpoints:

| Endpoint | Purpose |
|---|---|
| `POST /api/shuffle` | Harness checks cache, spawns async agent generation if missing |
| `GET /api/status/:idiom` | Polls generation progress (`processing` → `completed`) |
| `GET /health` | Health check |

### Frontend — React + Vite + TypeScript + Vanilla CSS

- Shows an **idiom illustration** and a **multiple-choice quiz**
- Uses **polling** (every 1.5s) to wait for async agent generation
- Tracks a **score counter** for correct answers
- States: `idle → processing → completed / failed`

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 8, TypeScript 6, Vanilla CSS |
| Backend / Harness | Node.js, Express 4, TypeScript |
| AI – Text Agent | Google Gemini 3.1 Flash-Lite |
| AI – Image Agent | Google Nano Banana 2 |
| Shared Cache / DB | Google Cloud Firestore |
| Storage | Google Cloud Storage |
| Deployment | Docker → Google Cloud Run |
| CI/CD | GitHub Actions + Workload Identity Federation |

---

## 🔐 Security

- **No long-lived keys** — GitHub Actions authenticates via **Workload Identity Federation** (OIDC), not service account key files
- **Secret Manager** — Gemini API key is stored in GCP Secret Manager and mounted at runtime, never in code or CI logs
- **Least privilege** — dedicated `github-deployer` service account with only the roles it needs

---

## 🚀 Getting Started

### Prerequisites

- Node.js 24+
- A Google Cloud project with **Firestore**, **Cloud Storage**, and **Vertex AI** enabled
- A `.env` file in `backend/` (see `backend/.env.example`)

### Install dependencies

```bash
npm install
```

### Run in development

```bash
# Start backend (port 8080)
npm run dev:backend

# Start frontend (port 5173)
npm run dev:frontend
```

### Build for production

```bash
npm run build:backend
npm run build:frontend
```

---

## 📦 Deployment

Run the setup script once to provision all GCP infrastructure and set all GitHub secrets automatically:

```bash
chmod +x setup.sh
./setup.sh
```

Then push to `main` — the GitHub Actions pipeline builds the Docker image, pushes it to Artifact Registry, and deploys to Cloud Run automatically.

---

## 📍 Project Status

| Phase | Status |
|---|---|
| Multi-agent harness (Express + Gemini + Nano Banana 2) | ✅ Complete |
| Shared Firestore cache layer | ✅ Complete |
| Frontend (React + Vite + polling) | ✅ Complete |
| Docker + GitHub Actions pipeline | ✅ Complete |
| GCP infrastructure setup (`setup.sh`) | ✅ Complete |
| **Deployed to Cloud Run** | ✅ Live |

---

*Built by [Simara Nascimento](https://github.com/simaraconceicao) for the Agentic Architect Sprint 2026 — \#AgenticArchitect \#GoogleAntigravity*
