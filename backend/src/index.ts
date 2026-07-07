import 'dotenv/config'; // Crucial: must be first to avoid ESM import hoisting race conditions!
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { getCachedIdiom, setCachedIdiom, normalizeIdiom, IdiomCache } from './services/firestore.js';
import { suggestRandomIdiom, generateQuiz } from './services/gemini.js';
import { generateLiteralIllustration } from './services/imageGenerator.js';

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

// In-memory queue / task registry
interface TaskStatus {
  status: 'processing' | 'completed' | 'failed';
  error?: string;
  data?: IdiomCache;
}

const activeTasks = new Map<string, TaskStatus>();

/**
 * Worker that runs quiz and image generation concurrently in the background
 */
async function runBackgroundGeneration(idiom: string) {
  const docId = normalizeIdiom(idiom);
  try {
    console.log(`[Worker] Starting background generation for idiom: "${idiom}" (ID: ${docId})`);
    
    // Trigger Gemini Quiz and Nano Banana 2 Illustration concurrently
    const [quiz, imageUrl] = await Promise.all([
      generateQuiz(idiom),
      generateLiteralIllustration(idiom),
    ]);

    const cacheData: IdiomCache = {
      idiom,
      quiz,
      imageUrl,
      createdAt: new Date().toISOString(),
    };

    // Save to global Firestore cache
    await setCachedIdiom(idiom, cacheData);

    // Update task registry
    activeTasks.set(docId, {
      status: 'completed',
      data: cacheData,
    });

    console.log(`[Worker] Successfully completed and cached idiom: "${idiom}"`);
  } catch (error: any) {
    console.error(`[Worker] Failed background generation for idiom: "${idiom}"`, error);
    activeTasks.set(docId, {
      status: 'failed',
      error: error?.message || 'Failed to generate quiz or image illustration.',
    });
  }
}

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * 1. Shuffle Route: Suggests an idiom, checks cache, and spawns generation if missing
 */
app.post('/api/shuffle', async (req, res) => {
  try {
    console.log('[Shuffle] Suggesting a new idiom...');
    const idiom = await suggestRandomIdiom();
    const docId = normalizeIdiom(idiom);
    console.log(`[Shuffle] Suggested idiom: "${idiom}" (ID: ${docId})`);

    // Check Firestore cache
    const cached = await getCachedIdiom(idiom);
    if (cached) {
      console.log(`[Shuffle] Cache hit! Returning cached idiom: "${idiom}"`);
      res.json({
        status: 'completed',
        idiom,
        data: cached,
      });
      return;
    }

    // Check if it is currently processing
    const activeTask = activeTasks.get(docId);
    if (activeTask && activeTask.status === 'processing') {
      console.log(`[Shuffle] Idiom "${idiom}" is already processing.`);
      res.status(202).json({
        status: 'processing',
        idiom,
      });
      return;
    }

    // Start background generation
    activeTasks.set(docId, { status: 'processing' });
    runBackgroundGeneration(idiom); // runs asynchronously, non-blocking

    console.log(`[Shuffle] Spawning generation task for "${idiom}"`);
    res.status(202).json({
      status: 'processing',
      idiom,
    });
  } catch (error: any) {
    console.error('[Shuffle] Error occurred:', error);
    res.status(500).json({ error: error?.message || 'Internal server error during shuffle' });
  }
});

/**
 * 2. Status Polling Route: Checks task progress or Firestore cache
 */
app.get('/api/status/:idiom', async (req, res) => {
  const { idiom } = req.params;
  const docId = normalizeIdiom(idiom);

  try {
    // Check Firestore cache
    const cached = await getCachedIdiom(idiom);
    if (cached) {
      // Cleanup the in-memory task since it's fully cached now
      activeTasks.delete(docId);
      res.json({
        status: 'completed',
        data: cached,
      });
      return;
    }

    // Check task registry
    const task = activeTasks.get(docId);
    if (task) {
      if (task.status === 'completed') {
        activeTasks.delete(docId); // cleanup
        res.json({
          status: 'completed',
          data: task.data,
        });
      } else if (task.status === 'failed') {
        activeTasks.delete(docId); // cleanup
        res.status(500).json({
          status: 'failed',
          error: task.error,
        });
      } else {
        res.json({
          status: 'processing',
        });
      }
      return;
    }

    // If not found in cache and not processing, return 404
    res.status(404).json({
      status: 'not_found',
      message: 'No generation task found for this idiom. Please trigger a shuffle.',
    });
  } catch (error: any) {
    console.error(`[Status] Error polling status for "${idiom}":`, error);
    res.status(500).json({ error: 'Internal server error polling task status' });
  }
});

// --- Production static serving ---
const frontendDistPath = path.join(process.cwd(), '../frontend/dist');

if (fs.existsSync(frontendDistPath)) {
  console.log(`[Production] Serving static files from: ${frontendDistPath}`);
  app.use(express.static(frontendDistPath));
  
  // Single Page Application routing fallback
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/health')) {
      return next();
    }
    res.sendFile(path.join(frontendDistPath, 'index.html'));
  });
} else {
  console.log('[Development] Static files folder not found. Serving API routes only.');
}

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
