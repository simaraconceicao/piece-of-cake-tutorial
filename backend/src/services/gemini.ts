import { GoogleGenAI } from '@google/genai';
import { QuizData } from './firestore.js';

let ai: GoogleGenAI | null = null;

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
 * Dynamically suggests a real American English idiom
 */
export async function suggestRandomIdiom(recentIdioms: string[] = []): Promise<string> {
  const modelName = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
  const client = getAiClient();

  const avoidClause = recentIdioms.length > 0
    ? `\nDo NOT suggest any of these recently used idioms: ${recentIdioms.map(i => `"${i}"`).join(', ')}.`
    : '';

  const prompt = `Suggest a single, popular American English idiom (for example: "spill the beans", "bite the bullet", "cost an arm and a leg").${avoidClause}
Return ONLY the idiom name itself in lowercase, with no quotes, no period, and no explanation.`;

  try {
    const response = await client.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        temperature: 1.0, // High temperature for random variety
      },
    });

    const text = response.text?.trim();
    if (!text) {
      throw new Error('No text returned from Gemini API during idiom suggestion.');
    }

    // Strip any quotes or wrapping punctuation
    return text.replace(/["'‘’.]$/g, '').replace(/^["'‘]/g, '').trim();
  } catch (error) {
    console.error('Failed to suggest a random idiom:', error);
    throw error;
  }
}

/**
 * Generates a structured English idiom multiple-choice quiz using Gemini 3.1 Flash-Lite
 */
export async function generateQuiz(idiom: string): Promise<QuizData> {
  const modelName = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
  const client = getAiClient();
  
  const prompt = `Generate a high-quality, challenging multiple-choice quiz question to test a student's understanding of the English idiom: "${idiom}".
The quiz must include 4 options. Only one option should be correct.
Provide a clear, educational explanation.

You MUST respond with a JSON object that adheres strictly to this structure:
{
  "question": "A fill-in-the-blank sentence or context question using the idiom.",
  "options": [
    "Option 1",
    "Option 2",
    "Option 3",
    "Option 4"
  ],
  "correctOption": "The exact string matching the correct option from the options array.",
  "explanation": "A concise explanation of why the correct option is right, explaining the idiom's meaning."
}`;

  try {
    const response = await client.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        temperature: 0.0, // Strict temperature for structured output
        responseMimeType: 'application/json',
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error('No text returned from Gemini API.');
    }

    const quiz = JSON.parse(text) as QuizData;

    // Validate the response shape
    if (
      !quiz.question ||
      !Array.isArray(quiz.options) ||
      quiz.options.length !== 4 ||
      !quiz.correctOption ||
      !quiz.explanation
    ) {
      throw new Error('Invalid JSON structure or incorrect number of options returned.');
    }

    // Ensure correctOption matches one of the options
    const match = quiz.options.find(
      (opt) => opt.trim().toLowerCase() === quiz.correctOption.trim().toLowerCase()
    );

    if (!match) {
      throw new Error(`Correct option "${quiz.correctOption}" was not found in the list of options.`);
    }

    // Standardize to use the exact matching option string
    quiz.correctOption = match;

    return quiz;
  } catch (error) {
    console.error(`Failed to generate quiz for idiom "${idiom}":`, error);
    throw error;
  }
}
