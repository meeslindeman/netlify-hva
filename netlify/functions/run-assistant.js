// netlify/functions/run-assistant.js
const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: 'Method Not Allowed' };
  }

  try {
    const { threadId } = JSON.parse(event.body);
    
    const run = await openai.beta.threads.runs.create(threadId, {
      assistant_id: process.env.ASSISTANT_ID
    });
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(run)
    };
  } catch (error) {
    console.error('Error running assistant:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to run assistant' })
    };
  }
};