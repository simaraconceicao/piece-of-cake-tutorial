# 🧁 Piece of Cake — Gamified English Idioms Lab

**Piece of Cake** is an AI-powered, full-stack language learning web app that teaches advanced American English idioms in a fun, gamified way. Users see a **literal illustration** of an idiom and must guess which idiom it represents.

---

## 🔄 User Flow

```
User clicks "Start Learning"
  → POST /api/shuffle (Gemini picks a random idiom)
  → If cached in Firestore → instant result ⚡
  → If not cached → background task starts (Gemini quiz + Imagen illustration run in parallel)
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
| `gemini.ts` | Uses **Gemini Flash** to suggest random idioms and generate structured quiz JSON (question, options, correct answer, explanation) |
| `imageGenerator.ts` | Uses **Imagen (Nano Banana 2)** to generate literal illustrations of idioms, saved to Google Cloud Storage |
| `firestore.ts` | **Firestore** cache layer to avoid regenerating the same idiom twice |

API endpoints:

| Endpoint | Purpose |
|---|---|
| `POST /api/shuffle` | Suggests a new idiom + spawns async background generation |
| `GET /api/status/:idiom` | Polls generation progress (`processing` → `completed`) |
| `GET /health` | Health check |

### Frontend — React + Vite + TypeScript + Vanilla CSS

- Shows an **idiom illustration** and a **multiple-choice quiz**
- Uses **polling** (every 1.5s) to wait for async AI generation
- Tracks a **score counter** for correct answers
- States: `idle → processing → completed / failed`

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 8, TypeScript 6, Vanilla CSS |
| Backend | Node.js, Express 4, TypeScript |
| AI – Text | Google Gemini Flash |
| AI – Images | Google Imagen (Nano Banana 2) |
| Cache / DB | Google Cloud Firestore |
| Storage | Google Cloud Storage |
| Deployment | Docker → Google Cloud Run |

---

## 🚀 Getting Started

### Prerequisites

- Node.js 20+
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

The app is containerized with Docker and deployed to **Google Cloud Run** via GitHub Actions on every push to `main`.

The pipeline:
1. Builds a unified Docker image (frontend static files served by the Express backend)
2. Pushes the image to **Artifact Registry**
3. Deploys to **Cloud Run** with all env vars and secrets injected automatically

---

## ⏭️ Next Steps

Everything is built. To deploy, do this **once** tomorrow:

### Step 1 — Authenticate the CLIs
```bash
gcloud auth login
gh auth login
```

### Step 2 — Run the automated setup script
This creates all GCP infrastructure and sets all GitHub secrets in one go:
```bash
chmod +x setup.sh
./setup.sh
```

It will ask for:
- Your GCP Project ID
- Your GCP region (default: `southamerica-east1`)
- Whether to create a new GitHub repo (say yes if you haven't already)
- Your Gemini API Key

Everything else has sensible defaults — just press Enter.

### Step 3 — Push to main
```bash
git add .
git commit -m "feat: initial deployment setup"
git push origin main
```

The GitHub Actions workflow fires automatically. Monitor it at:
`https://github.com/YOUR_USERNAME/the-cake-tutorial/actions`

### Step 4 — Set a billing alert (optional but recommended)
Go to **GCP Console → Billing → Budgets & Alerts** and set a $5/month alert.  
For personal/educational use, you'll realistically pay ~$0/month.

---

## 📍 Project Status

| Phase | Status |
|---|---|
| Backend (Express + Gemini + Firestore + GCS) | ✅ Complete |
| Frontend (React + Vite + polling) | ✅ Complete |
| Docker + GitHub Actions pipeline | ✅ Complete |
| GCP infrastructure setup (`setup.sh`) | ✅ Complete |
| **First deployment to Cloud Run** | ⏳ Pending |
