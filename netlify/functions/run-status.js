// netlify/functions/run-status.js
const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers };
  }

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: 'Method Not Allowed' };
  }

  try {
    const { threadId, runId } = event.queryStringParameters;
    
    if (!threadId || !runId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing threadId or runId' })
      };
    }
    
    const run = await openai.beta.threads.runs.retrieve(threadId, runId);
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(run)
    };
  } catch (error) {
    console.error('Error getting run status:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to get run status' })
    };
  }
};