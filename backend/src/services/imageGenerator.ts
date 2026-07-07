import { GoogleGenAI } from '@google/genai';
import { Storage } from '@google-cloud/storage';
import { normalizeIdiom } from './firestore.js';

let ai: GoogleGenAI | null = null;
let storage: Storage | null = null;

/**
 * Lazily initializes and returns the Google Gen AI client
 */
function getAiClient(): GoogleGenAI {
  if (!ai) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY environment variable is not defined.');
    }
    ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });
  }
  return ai;
}

/**
 * Lazily initializes and returns the GCS client
 */
function getStorageClient(): Storage {
  if (!storage) {
    storage = new Storage({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || undefined,
    });
  }
  return storage;
}

/**
 * Generates a literal illustration for an English idiom using Nano Banana 2
 */
export async function generateLiteralIllustration(idiom: string): Promise<string> {
  const modelName = process.env.IMAGEN_MODEL || 'gemini-3.1-flash-image-preview';
  const client = getAiClient();
  
  const prompt = `A flat, minimalist vector line art illustration depicting the literal meaning of the English idiom: "${idiom}".
Do NOT illustrate the figurative meaning.
For example, if the idiom is "spill the beans", draw a simple, clean outline of a jar with a few red beans spilling out.
The style must be extremely clean, modern, and minimal, with simple black outlines and solid color fills on a pure, solid white background.
It must contain absolutely NO text, labels, letters, gradients, or complex shadows.`;

  try {
    const response = await client.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        responseModalities: ['IMAGE'],
      },
    });

    const part = response.candidates?.[0]?.content?.parts?.[0];
    if (!part || !part.inlineData || !part.inlineData.data) {
      throw new Error('No image data returned from Nano Banana 2.');
    }

    const base64Data = part.inlineData.data;
    
    // Check if Cloud Storage bucket is configured
    const bucketName = process.env.GCS_BUCKET_NAME;
    if (bucketName) {
      const docId = normalizeIdiom(idiom);
      const fileName = `${docId}-${Date.now()}.jpg`;
      const storageClient = getStorageClient();
      const bucket = storageClient.bucket(bucketName);
      const file = bucket.file(fileName);
      
      const buffer = Buffer.from(base64Data, 'base64');
      
      await file.save(buffer, {
        metadata: {
          contentType: 'image/jpeg',
          cacheControl: 'public, max-age=31536000',
        },
        resumable: false,
      });
      
      return `https://storage.googleapis.com/${bucketName}/${fileName}`;
    }

    // Fallback for local development: return base64 Data URL
    return `data:image/jpeg;base64,${base64Data}`;
  } catch (error) {
    console.error(`Failed to generate illustration for idiom "${idiom}":`, error);
    throw error;
  }
}
