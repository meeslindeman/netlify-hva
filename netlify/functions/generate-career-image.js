// netlify/functions/generate-career-image.js
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

    console.log('🎨 Quick generation with Pollinations AI, prompt:', prompt);
    
    // Use Pollinations.ai - free and fast (usually 3-6 seconds)
    const encodedPrompt = encodeURIComponent(prompt);
    const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&seed=${Date.now()}`;
    
    // Test if the URL works by making a HEAD request
    const testResponse = await fetch(imageUrl, { method: 'HEAD' });
    
    if (testResponse.ok) {
      console.log('✅ Image generated successfully with Pollinations');
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          imageUrl: imageUrl,
          originalPrompt: prompt,
          message: 'Image generated successfully'
        })
      };
    } else {
      throw new Error('Failed to generate image');
    }

  } catch (error) {
    console.error('❌ Error generating image:', error);
    
    // Fallback: return a placeholder image with text overlay
    const fallbackUrl = `https://via.placeholder.com/1024x1024/4A90E2/FFFFFF?text=${encodeURIComponent('Your Future Professional Self')}`;
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        imageUrl: fallbackUrl,
        originalPrompt: prompt,
        message: 'Generated placeholder - upgrade for AI images',
        isPlaceholder: true
      })
    };
  }
};