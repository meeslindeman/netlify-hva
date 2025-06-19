// netlify/functions/add-message.js
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
    const { threadId, content } = JSON.parse(event.body);
    
    const message = await openai.beta.threads.messages.create(threadId, {
      role: 'user',
      content: content
    });
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(message)
    };
  } catch (error) {
    console.error('Error adding message:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to add message' })
    };
  }
};