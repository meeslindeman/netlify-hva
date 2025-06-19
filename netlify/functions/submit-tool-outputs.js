// netlify/functions/submit-tool-outputs.js
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
    const { threadId, runId, tool_outputs } = JSON.parse(event.body);
    
    if (!threadId || !runId || !tool_outputs) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing required parameters' })
      };
    }
    
    const run = await openai.beta.threads.runs.submitToolOutputs(threadId, runId, {
      tool_outputs: tool_outputs
    });
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(run)
    };
  } catch (error) {
    console.error('Error submitting tool outputs:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to submit tool outputs' })
    };
  }
};