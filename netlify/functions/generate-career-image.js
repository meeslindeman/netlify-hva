// netlify/functions/generate-career-image.js
const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Function configuration for Netlify
exports.config = {
  timeout: 60
};

exports.handler = async (event, context) => {
  // Explicitly set context timeout
  context.callbackWaitsForEmptyEventLoop = false;
  
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
    const { prompt } = JSON.parse(event.body);
    
    if (!prompt) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          success: false,
          error: 'No prompt provided'
        })
      };
    }

    console.log('🎨 Generating image with DALL-E 3, prompt:', prompt);
    console.log('⏰ Starting generation at:', new Date().toISOString());
    
    // Generate image with DALL-E 3 - no timeout wrapper, let Netlify handle it
    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: prompt,
      n: 1,
      size: "1024x1024",
      quality: "standard",
      style: "vivid"
    });

    console.log('✅ Generation completed at:', new Date().toISOString());

    if (!response || !response.data || !response.data[0]) {
      throw new Error('Invalid response from DALL-E');
    }

    const imageUrl = response.data[0].url;
    const revisedPrompt = response.data[0].revised_prompt;
    
    console.log('✅ Image generated successfully, URL:', imageUrl.substring(0, 50) + '...');
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        imageUrl: imageUrl,
        originalPrompt: prompt,
        revisedPrompt: revisedPrompt,
        message: 'Image generated successfully'
      })
    };

  } catch (error) {
    console.error('❌ Error generating image with DALL-E:', error);
    console.error('❌ Error at:', new Date().toISOString());
    
    let errorMessage = 'Er ging iets mis bij het maken van de afbeelding.';
    
    if (error.message.includes('timeout')) {
      errorMessage = 'Het genereren van de afbeelding duurt te lang. Probeer het opnieuw.';
    } else if (error.message.includes('content_policy')) {
      errorMessage = 'De afbeelding kon niet gegenereerd worden vanwege beleidsregels.';
    } else if (error.message.includes('rate_limit')) {
      errorMessage = 'Te veel verzoeken. Probeer het over een minuut opnieuw.';
    } else if (error.message.includes('quota') || error.message.includes('insufficient_quota')) {
      errorMessage = 'DALL-E service tijdelijk niet beschikbaar. Probeer het later opnieuw.';
    } else if (error.message.includes('billing')) {
      errorMessage = 'OpenAI billing issue. Controleer je OpenAI account.';
    }

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message,
        message: errorMessage
      })
    };
  }
};