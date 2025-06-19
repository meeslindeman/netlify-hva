// netlify/functions/messages.js
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
    const { threadId } = event.queryStringParameters;
    
    if (!threadId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing threadId' })
      };
    }
    
    const messages = await openai.beta.threads.messages.list(threadId);
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(messages)
    };
  } catch (error) {
    console.error('Error getting messages:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to get messages' })
    };
  }
};