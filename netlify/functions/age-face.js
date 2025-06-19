// netlify/functions/age-face.js
const Replicate = require('replicate');

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
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
    const { imageBase64, ageTarget } = JSON.parse(event.body);
    
    if (!imageBase64) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          success: false, 
          error: 'No image provided',
          message: 'Geen afbeelding ontvangen'
        })
      };
    }

    console.log('Starting face aging process...');
    
    // Use the SAM model for aging
    const output = await replicate.run(
      "yuval-alaluf/sam:9222a21c181b707209ef12b5e0d7e94c994b58f01c7445b1f2eee1e563e5398",
      {
        input: imageBase64,
        target_age: ageTarget || 50
      }
    );

    console.log('Replicate output:', output);

    if (output && (typeof output === 'string' || Array.isArray(output))) {
      // Handle different output formats from Replicate
      let imageUrl = Array.isArray(output) ? output[0] : output;
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          agedImageUrl: imageUrl,
          targetAge: ageTarget || 50,
          message: 'Image aging completed successfully'
        })
      };
    } else {
      console.error('Unexpected output format:', output);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Unexpected output format',
          message: 'Onverwacht resultaat van de AI service'
        })
      };
    }

  } catch (error) {
    console.error('Error in face aging:', error);
    
    let errorMessage = 'Er ging iets mis bij het verouderen van je foto.';
    
    if (error.message.includes('face')) {
      errorMessage = 'Geen gezicht gevonden in de foto. Probeer een duidelijkere foto.';
    } else if (error.message.includes('timeout') || error.message.includes('time')) {
      errorMessage = 'De verwerking duurde te lang. Probeer het opnieuw.';
    } else if (error.message.includes('quota') || error.message.includes('limit')) {
      errorMessage = 'Service tijdelijk overbelast. Probeer het later opnieuw.';
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