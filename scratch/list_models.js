
const GEMINI_API_KEY = 'AIzaSyCdDoTtuNrJWexV4pS16ox8pdJzOy_XvOM';

async function listModels() {
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${GEMINI_API_KEY}`);
    const data = await response.json();
    console.log(JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error fetching models:', error);
  }
}

listModels();
