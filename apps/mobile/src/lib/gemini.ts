import { Trip } from '../types';

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;

export interface AIAnalysisResult {
  score: number;
  summary: string;
  sections: {
    title: string;
    score: number;
    content: string;
  }[];
  tips: string[];
  optimizedItinerary?: any[];
}

export const analyzeTripWithAI = async (trip: Trip, totalSpent: number, budgetLimit: number): Promise<AIAnalysisResult> => {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key is not configured');
  }

  const itineraryText = (trip.itinerary || []).map(day => (
    `Day ${day.day}:\n${(day.items || []).map(it => `- ${it.time || 'Time TBD'} - ${it.name}(${it.loc})`).join('\n')}`
  )).join('\n\n');

  const budgetText = `Budget Limit: ₩${budgetLimit.toLocaleString()}, Total Spent: ₩${totalSpent.toLocaleString()}`;

  const prompt = `
    You are a professional travel consultant. Please analyze this travel itinerary and provide a detailed report.
    Trip Name: ${trip.name}
    Destination: ${trip.startDate || 'Not specified'}
    
    [Itinerary]
    ${itineraryText}
    
    [Budget]
    ${budgetText}

    Please analyze the following 5 points in Korean:
    1. Route Efficiency (Geographical optimization)
    2. Tempo & Fatigue (Is it too tight or too loose?)
    3. Variety & Theme (Balance of activities)
    4. Budget Realism (Is the budget appropriate for the destination?)
    5. Practical Pro-tips (Specific advice for this trip)

    [Critical Request]
    Also provide an "optimizedItinerary" which is a restructured version of the input itinerary for better efficiency. 
    Keep EXACTLY the same data structure for days and items (including all fields like id, name, time, loc, lat, lng).

    Respond strictly in JSON format as follows:
    {
      "score": number (overall score 0-100),
      "summary": "Short overall summary in Korean",
      "sections": [
        { "title": "동선 효율성", "score": number, "content": "Detailed analysis in Korean" },
        { "title": "여행 강도", "score": number, "content": "Detailed analysis in Korean" },
        { "title": "테마 및 균형", "score": number, "content": "Detailed analysis in Korean" },
        { "title": "예산 적절성", "score": number, "content": "Detailed analysis in Korean" },
        { "title": "꿀팁", "score": number, "content": "Detailed analysis in Korean" }
      ],
      "tips": ["구체적인 추천 액션 1", "추천 액션 2", "추천 액션 3"],
      "optimizedItinerary": [
        { "day": 1, "items": [...] }
      ]
    }
  `;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash-lite:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }]
      })
    });

    const data = await response.json();
    const resultText = data.candidates[0].content.parts[0].text;
    
    // JSON 추출 (Markdown backticks 제거)
    const jsonMatch = resultText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Invalid AI response format');
    
    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error('AI Analysis failed:', error);
    throw error;
  }
};
