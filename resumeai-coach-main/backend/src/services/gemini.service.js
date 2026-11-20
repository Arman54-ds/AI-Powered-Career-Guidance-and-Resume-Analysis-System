import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import { AppError } from '../middleware/error.middleware.js';
dotenv.config();

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const AI_DISABLED = !GEMINI_KEY || GEMINI_KEY === 'placeholder';

if (AI_DISABLED) {
  console.warn('⚠️  GEMINI_API_KEY not set — AI features will return demo data.');
}

const genAI = AI_DISABLED ? null : new GoogleGenerativeAI(GEMINI_KEY);

/**
 * Initializes the Gemini model.
 * Uses gemini-2.0-flash: Stable GA model — fast, cost-effective, and globally available.
 */
const getModel = (requireJson = false, systemInstruction = null) => {
  const modelConfig = { model: 'gemini-3.8-flash' };
  const generationConfig = {};

  if (systemInstruction) {
    modelConfig.systemInstruction = systemInstruction;
  }

  if (requireJson) {
    // Native JSON mode guarantees a clean JSON string, eliminating regex parsing
    generationConfig.responseMimeType = 'application/json';
  }

  return genAI.getGenerativeModel(modelConfig, { generationConfig });
};

const safeJsonParse = (text) => {
  try {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch (error) {
    console.error('Failed to parse AI JSON response:', error.message, '\nRaw Text:', text);
    throw new AppError('AI generated an invalid response format. Please try again.', 500);
  }
};

const handleGeminiError = (error) => {
  console.error("Gemini Error Details:", error);
  const message = error.message || '';
  
  if (message.includes('429') || message.includes('Too Many Requests') || message.includes('quota')) {
    throw { statusCode: 429, message: 'AI service quota exceeded. Please try again in a few moments.', retryAfter: 60 };
  }

  if (message.includes('401') || message.includes('Unauthorized') || message.includes('invalid API key')) {
    throw { statusCode: 500, message: 'AI service authentication failed. Please contact support.' };
  }

  if (message.includes('location') || message.includes('User location is not supported')) {
    throw { statusCode: 503, message: 'AI service is not available in this region. Please contact support.' };
  }

  if (message.includes('RESOURCE_EXHAUSTED')) {
    throw { statusCode: 429, message: 'AI service is temporarily busy. Please try again shortly.', retryAfter: 30 };
  }

  if (message.includes('ERR_') || message.includes('ECONNREFUSED')) {
    throw { statusCode: 503, message: 'AI service is temporarily unavailable. Please try again.' };
  }
  
  if (error.statusCode) {
    throw error;
  }
  
  throw { statusCode: 500, message: 'Failed to process request with AI service. Please try again.' };
};

export const analyzeResume = async (resumeText, jobDescription = '') => {
  if (AI_DISABLED) {
    return {
      atsScore: 72,
      overallScore: 68,
      strengths: ['Clear formatting', 'Relevant work experience listed', 'Good use of action verbs'],
      weaknesses: ['Missing quantified achievements', 'Summary section could be stronger'],
      suggestions: ['Add metrics to your bullet points (e.g. "increased sales by 30%")', 'Tailor keywords to the job description', 'Add a professional summary at the top'],
      keywordGaps: ['leadership', 'agile', 'cross-functional'],
      matchedKeywords: ['JavaScript', 'React', 'Node.js'],
      sections: {
        contact: { score: 90, feedback: 'Contact information is complete and well-formatted.' },
        summary: { score: 55, feedback: 'Consider adding a 2-3 sentence professional summary.' },
        experience: { score: 75, feedback: 'Good experience listed; add measurable results to each role.' },
        education: { score: 85, feedback: 'Education section is clear and complete.' },
        skills: { score: 70, feedback: 'Good skill set; consider grouping by category.' },
      },
    };
  }
  try {
    const model = getModel(true); // Enable JSON mode
    const jdSection = jobDescription
      ? `Job Description:\n${jobDescription}\n\nPerform keyword gap analysis between the resume and job description.`
      : 'No job description provided. Skip keyword gap analysis.';

    const prompt = `You are an expert ATS resume analyzer and career coach. Analyze this resume and provide a detailed, structured evaluation.

Resume Text:
${resumeText}

${jdSection}

Scoring Criteria:
- atsScore (0-100): Evaluates ATS compatibility, keyword optimization, formatting, and resume parsability.
- overallScore (0-100): Evaluates overall resume quality including content impact, clarity, action verbs, achievements, relevance, and grammar.

Use this exact JSON structure:
{
  "atsScore": <number 0-100>,
  "overallScore": <number 0-100>,
  "strengths": [<string>, ...],
  "weaknesses": [<string>, ...],
  "suggestions": [<string>, ...],
  "keywordGaps": [<string>, ...],
  "matchedKeywords": [<string>, ...],
  "sections": {
    "contact": { "score": <0-100>, "feedback": "<string>" },
    "summary": { "score": <0-100>, "feedback": "<string>" },
    "experience": { "score": <0-100>, "feedback": "<string>" },
    "education": { "score": <0-100>, "feedback": "<string>" },
    "skills": { "score": <0-100>, "feedback": "<string>" }
  }
}`;

    const result = await model.generateContent(prompt);
    // Because of responseMimeType, we can parse immediately
    return safeJsonParse(result.response.text()); 
  } catch (error) {
    handleGeminiError(error);
  }
};

export const generateInterviewQuestions = async ({ mode, role, difficulty, totalQuestions, resumeText }) => {
  if (AI_DISABLED) {
    const demos = [
      'Tell me about yourself and your background.',
      'What are your greatest strengths and weaknesses?',
      'Describe a challenging project you worked on.',
      'How do you handle tight deadlines?',
      'Where do you see yourself in 5 years?',
      'Why do you want this role?',
      'How do you work in a team environment?',
      'Describe a conflict with a coworker and how you resolved it.',
      'What motivates you professionally?',
      'Do you have any questions for us?',
    ];
    return demos.slice(0, totalQuestions || 5);
  }
  try {
    const model = getModel(true); // Enable JSON mode

    let contextPrompt = '';
    if (mode === 'resume' && resumeText) {
      contextPrompt = `Generate questions based on this resume:\n${resumeText.substring(0, 3000)}`;
    } else if (mode === 'technical') {
      contextPrompt = `Generate technical interview questions for a ${role || 'software engineer'} role.`;
    } else if (mode === 'hr') {
      contextPrompt = `Generate HR behavioral interview questions for a ${role || 'professional'} role. Focus on situational, behavioral, and culture-fit questions.`;
    }

    const prompt = `You are an expert interviewer. ${contextPrompt}

Difficulty: ${difficulty}
Number of questions: ${totalQuestions}

Return ONLY a valid JSON array of exactly ${totalQuestions} questions:
["<question1>", "<question2>", ...]

Make questions ${difficulty === 'easy' ? 'straightforward and foundational' : difficulty === 'medium' ? 'moderate and scenario-based' : 'challenging and in-depth'}. No numbering in the strings.`;

    const result = await model.generateContent(prompt);
    return safeJsonParse(result.response.text());
  } catch (error) {
    handleGeminiError(error);
  }
};

export const evaluateAnswer = async ({ question, answer, mode, difficulty }) => {
  if (AI_DISABLED) {
    return {
      score: 7,
      feedback: 'Good answer overall. You demonstrated relevant knowledge and communicated your point clearly.',
      strengths: 'You provided a structured response with a clear example.',
      improvements: 'Consider adding more specific metrics or outcomes to strengthen your answer.',
      suggestedAnswer: 'A strong answer would include the situation, your specific action, and a measurable result (STAR method).',
    };
  }
  try {
    const model = getModel(true); // Enable JSON mode

    const prompt = `You are an expert interviewer evaluating a candidate's answer.

Question: ${question}
Candidate's Answer: ${answer}
Interview Type: ${mode}
Difficulty: ${difficulty}

Evaluate the answer and provide highly specific, actionable feedback. Avoid generic phrases.
Return a JSON object with this structure:
{
  "score": <number 0-10>,
  "feedback": "<highly specific, actionable constructive feedback in 2-3 sentences>",
  "strengths": "<what was good about this answer>",
  "improvements": "<specific areas to improve>",
  "suggestedAnswer": "<a concise suggested answer to the question in less than 100 words>"
}`;

    const result = await model.generateContent(prompt);
    return safeJsonParse(result.response.text());
  } catch (error) {
    handleGeminiError(error);
  }
};

export const generateInterviewSummary = async (questions, mode) => {
  if (AI_DISABLED) {
    return {
      finalScore: 72,
      summary: 'You performed well overall in this interview session. Your answers were structured and demonstrated relevant knowledge. With some practice on quantifying your achievements and using the STAR method more consistently, you will be an even stronger candidate.',
      strongAreas: ['Communication', 'Technical Knowledge'],
      weakAreas: ['Quantifying Results', 'Conciseness'],
      nextSteps: ['Practice STAR method answers', 'Research the company before interviews', 'Prepare 3-5 questions to ask the interviewer'],
    };
  }
  try {
    const model = getModel(true); // Enable JSON mode

    const qa = questions.map((q) => ({
      q: q.question,
      a: q.userAnswer,
      score: q.score,
    }));

    const prompt = `You are an expert career coach. Based on this completed interview session, provide a comprehensive summary.

Interview Mode: ${mode}
Questions and Scores:
${JSON.stringify(qa, null, 2)}

Return a JSON object with this structure:
{
  "finalScore": <overall score 0-100>,
  "summary": "<2-3 paragraph overall performance summary>",
  "strongAreas": ["<topic>", ...],
  "weakAreas": ["<topic>", ...],
  "nextSteps": ["<actionable advice>", ...]
}`;

    const result = await model.generateContent(prompt);
    return safeJsonParse(result.response.text());
  } catch (error) {
    handleGeminiError(error);
  }
};

export const chatWithAI = async (messages, context = '') => {
  if (AI_DISABLED) {
    return 'AI features are currently disabled. To enable them, add your free Gemini API key to backend/.env (GEMINI_API_KEY). Get one at https://aistudio.google.com/app/apikey';
  }
  try {
    const systemInstruction = `You are an expert AI career coach and interview preparation assistant. Help users improve their answers, explain interview concepts, and provide career advice. Be concise, practical, and encouraging.
${context ? `Context: ${context}` : ''}`;
    
    // Initialize model with System Instructions, JSON mode off
    const model = getModel(false, systemInstruction); 

    const chat = model.startChat({
      history: messages.slice(0, -1).map((m) => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }],
      })),
    });

    const lastMessage = messages[messages.length - 1];
    // No need to prepend the system prompt anymore!
    const result = await chat.sendMessage(lastMessage.content); 
    return result.response.text();
  } catch (error) {
    handleGeminiError(error);
  }
};