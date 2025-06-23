// netlify/functions/edit-career-image.js
const OpenAI = require('openai');

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
    
    // Create career-specific prompt
    const prompt = createCareerPrompt(careerField, specificRole);
    console.log('📝 Using prompt:', prompt);
    
    // Convert base64 image data to buffer
    const base64Data = imageData.replace(/^data:image\/[a-z]+;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');
    
    console.log('📊 Image buffer size:', imageBuffer.length, 'bytes');
    
    // Import toFile from OpenAI for proper file handling
    const { toFile } = require('openai');
    
    // Create proper file object for OpenAI
    const imageFile = await toFile(imageBuffer, 'image.png', {
      type: 'image/png'
    });
    
    console.log('📁 Created file object for OpenAI');
    
    // Set up timeout promise to prevent Netlify timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Request timeout')), 24000); // 24s timeout
    });
    
    // Edit image with OpenAI using proper file object
    const editPromise = openai.images.edit({
      model: "dall-e-2",
      image: imageFile,
      prompt: prompt,
      response_format: "b64_json",
      size: "1024x1024"
    });
    
    console.log('🚀 Starting OpenAI image edit request...');
    
    // Race between edit and timeout
    const response = await Promise.race([editPromise, timeoutPromise]);

    console.log('✅ Edit completed at:', new Date().toISOString());

    if (!response || !response.data || !response.data[0]) {
      throw new Error('Invalid response from OpenAI image edit');
    }

    const editedImageBase64 = response.data[0].b64_json;
    const imageUrl = `data:image/png;base64,${editedImageBase64}`;
    
    console.log('✅ Career image edited successfully, size:', editedImageBase64.length, 'chars');
    
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
    } else if (error.message.includes('image_size')) {
      errorMessage = 'De afbeelding is te groot of heeft een ongeldige grootte.';
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
  // Map career fields to professional transformation prompts
  const careerPrompts = {
    // Zorg & Welzijn
    'zorg': 'Transform this person into a confident healthcare professional wearing medical scrubs or professional healthcare attire, looking accomplished and caring',
    'verpleegkunde': 'Transform this person into a professional nurse wearing modern medical scrubs, with a confident and caring expression, in a medical setting',
    'fysiotherapie': 'Transform this person into a professional physiotherapist wearing appropriate medical attire, looking confident and knowledgeable',
    'sociaal werk': 'Transform this person into a professional social worker in business casual attire, with a warm and professional appearance',
    
    // Onderwijs
    'onderwijs': 'Transform this person into a confident teacher or educator in professional attire, looking inspiring and knowledgeable',
    'leraar': 'Transform this person into a professional teacher wearing smart casual professional attire, with an inspiring and confident expression',
    'pedagogiek': 'Transform this person into a professional educator or pedagogue in business attire, looking wise and approachable',
    
    // Techniek & IT
    'techniek': 'Transform this person into a professional engineer or technician wearing appropriate work attire, looking skilled and confident',
    'informatica': 'Transform this person into a professional software developer or IT specialist in modern business casual attire, looking innovative and skilled',
    'elektrotechniek': 'Transform this person into a professional electrical engineer wearing appropriate technical attire, looking expert and confident',
    'bouwkunde': 'Transform this person into a professional architect or construction engineer wearing business attire with hard hat nearby, looking accomplished',
    
    // Business & Economie
    'business': 'Transform this person into a professional business person wearing a modern suit or business attire, looking successful and confident',
    'economie': 'Transform this person into a professional economist or business analyst in sophisticated business attire, looking accomplished and smart',
    'marketing': 'Transform this person into a creative marketing professional in stylish business casual attire, looking innovative and successful',
    'finance': 'Transform this person into a professional financial advisor or analyst wearing formal business attire, looking trustworthy and successful',
    
    // Creatief
    'creativiteit': 'Transform this person into a creative professional with artistic flair in their styling, looking inspired and accomplished',
    'design': 'Transform this person into a professional designer wearing stylish creative attire, looking artistic and innovative',
    'media': 'Transform this person into a media professional wearing contemporary business casual attire, looking creative and confident',
    
    // Sport
    'sport': 'Transform this person into a professional sports coach or fitness instructor wearing appropriate athletic professional attire, looking energetic and accomplished',
    
    // Default
    'default': 'Transform this person into a confident professional wearing appropriate business attire, looking successful and accomplished in their career'
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