// netlify/functions/edit-career-image.js
const OpenAI = require('openai');
const { toFile } = require('openai');
const { Readable } = require('stream');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Function configuration for Netlify
exports.config = {
  timeout: 26 // Just under Netlify's 30s limit, giving buffer for processing
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
    console.log('🎯 Starting edit-career-image function');
    
    const { imageData, careerField, specificRole } = JSON.parse(event.body);
    
    if (!imageData) {
      console.error('❌ No image data provided');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          success: false,
          error: 'No image data provided'
        })
      };
    }

    if (!careerField) {
      console.error('❌ No career field provided');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          success: false,
          error: 'No career field provided'
        })
      };
    }

    console.log('🎨 Editing image for career field:', careerField);
    console.log('⏰ Starting edit at:', new Date().toISOString());
    
    // Create career-specific prompt (keep it simple like the working example)
    const prompt = createCareerPrompt(careerField, specificRole);
    console.log('📝 Using prompt:', prompt);
    
    // Convert base64 image data to buffer (exactly like the working script)
    const base64Data = imageData.replace(/^data:image\/[a-z]+;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');
    
    console.log('📊 Image buffer size:', imageBuffer.length, 'bytes');
    
    // Determine image type (like the working script)
    const imageType = imageData.includes('data:image/png') ? 'image/png' : 'image/jpeg';
    console.log('📊 Image type:', imageType);
    
    // Create a readable stream from the buffer (like fs.createReadStream in working script)
    const imageStream = Readable.from(imageBuffer);
    
    // Convert to file format suitable for OpenAI API (exactly like working script)
    const image = await toFile(imageStream, null, { type: imageType });
    
    console.log('📁 Created file object for OpenAI');
    
    // Set up timeout promise to prevent Netlify timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Request timeout')), 24000); // 24s timeout
    });
    
    // Edit image with OpenAI (exactly like the working script)
    const editPromise = openai.images.edit({
      model: "gpt-image-1", // Use the same model as working script
      image,
      prompt,
    });
    
    console.log('🚀 Starting OpenAI image edit request...');
    
    // Race between edit and timeout
    const response = await Promise.race([editPromise, timeoutPromise]);

    console.log('✅ Edit completed at:', new Date().toISOString());

    // Handle response (exactly like the working script)
    if (!response.data || response.data.length === 0) {
      throw new Error('No image returned from OpenAI API');
    }

    const image_base64 = response.data[0].b64_json;
    if (!image_base64) {
      throw new Error('No base64 image data returned from OpenAI API');
    }

    // Convert to data URL for frontend display
    const imageUrl = `data:image/png;base64,${image_base64}`;
    
    console.log('✅ Career image edited successfully, size:', image_base64.length, 'chars');
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        imageUrl: imageUrl,
        careerField: careerField,
        prompt: prompt,
        message: 'Career image edited successfully'
      })
    };

  } catch (error) {
    console.error('❌ Error editing career image:', error);
    console.error('❌ Error details:', error.message);
    console.error('❌ Error stack:', error.stack);
    console.error('❌ Error at:', new Date().toISOString());
    
    let errorMessage = 'Er ging iets mis bij het bewerken van de afbeelding.';
    
    if (error.message.includes('timeout')) {
      errorMessage = 'Het bewerken van de afbeelding duurt te lang. Probeer het opnieuw.';
    } else if (error.message.includes('content_policy')) {
      errorMessage = 'De afbeelding kon niet bewerkt worden vanwege beleidsregels.';
    } else if (error.message.includes('rate_limit')) {
      errorMessage = 'Te veel verzoeken. Probeer het over een minuut opnieuw.';
    } else if (error.message.includes('quota') || error.message.includes('insufficient_quota')) {
      errorMessage = 'OpenAI service tijdelijk niet beschikbaar. Probeer het later opnieuw.';
    } else if (error.message.includes('Invalid image')) {
      errorMessage = 'De geüploade afbeelding is niet geschikt. Probeer een andere foto.';
    }

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message,
        message: errorMessage,
        debug: {
          hasImageData: !!imageData,
          careerField: careerField,
          errorType: error.constructor.name
        }
      })
    };
  }
};

function createCareerPrompt(careerField, specificRole) {
  // Keep prompts simple and focused on transformation (like "Make the person look 40 years older")
  const careerPrompts = {
    // Zorg & Welzijn
    'zorg': 'Transform this person into a confident healthcare professional wearing medical scrubs',
    'verpleegkunde': 'Transform this person into a professional nurse wearing medical scrubs',
    'fysiotherapie': 'Transform this person into a professional physiotherapist in medical attire',
    'sociaal werk': 'Transform this person into a professional social worker in business casual attire',
    
    // Onderwijs
    'onderwijs': 'Transform this person into a confident teacher in professional attire',
    'leraar': 'Transform this person into a professional teacher wearing smart casual attire',
    'pedagogiek': 'Transform this person into a professional educator in business attire',
    
    // Techniek & IT
    'techniek': 'Transform this person into a professional engineer in appropriate work attire',
    'informatica': 'Transform this person into a software developer in modern business casual attire',
    'elektrotechniek': 'Transform this person into a professional electrical engineer in technical attire',
    'bouwkunde': 'Transform this person into a professional architect in business attire',
    
    // Business & Economie
    'business': 'Transform this person into a successful business professional in a modern suit',
    'economie': 'Transform this person into a professional economist in sophisticated business attire',
    'marketing': 'Transform this person into a creative marketing professional in stylish business casual',
    'finance': 'Transform this person into a financial advisor in formal business attire',
    
    // Creatief
    'creativiteit': 'Transform this person into a creative professional with artistic styling',
    'design': 'Transform this person into a professional designer in stylish creative attire',
    'media': 'Transform this person into a media professional in contemporary business casual',
    
    // Sport
    'sport': 'Transform this person into a professional sports coach in athletic professional attire',
    
    // Default
    'default': 'Transform this person into a confident professional in appropriate business attire'
  };
  
  // Use specific role if provided, otherwise use career field
  const key = specificRole?.toLowerCase() || careerField?.toLowerCase() || 'default';
  
  // Find matching prompt or use default
  for (const [field, prompt] of Object.entries(careerPrompts)) {
    if (key.includes(field)) {
      return prompt;
    }
  }
  
  return careerPrompts.default;
}