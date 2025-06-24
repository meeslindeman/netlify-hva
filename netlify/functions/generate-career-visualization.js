import { OpenAI } from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Simple in-memory storage for uploaded images during function execution
// Note: This is temporary and will be lost between function calls
const uploadedImages = new Map();

export async function handler(event, context) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { careerField, specificRole, userMessage, threadId, uploadedImageBase64 } = JSON.parse(event.body);
    
    let response;
    
    if (uploadedImageBase64) {
      // Use image editing to transform the uploaded photo
      console.log('🎨 Using uploaded image for career transformation');
      
      // Create a transformation prompt based on career field
      let prompt = `Transform this person into a successful ${specificRole || careerField} professional. `;
      
      // Add field-specific details
      switch(careerField) {
        case 'zorg':
          prompt += 'Show them as a healthcare professional in medical attire, in a modern medical environment, confident and caring expression';
          break;
        case 'onderwijs':
          prompt += 'Show them as an educator in professional teaching attire, in a classroom setting, inspiring and knowledgeable expression';
          break;
        case 'techniek':
          prompt += 'Show them as a technology professional in smart casual attire, in a modern tech workspace, innovative and focused expression';
          break;
        case 'business':
          prompt += 'Show them as a business professional in formal business attire, in a corporate environment, confident and successful expression';
          break;
        case 'creativiteit':
          prompt += 'Show them as a creative professional in stylish attire, in an artistic studio workspace, inspiring and artistic expression';
          break;
        case 'sport':
          prompt += 'Show them as a sports professional in athletic professional wear, in a sports facility, energetic and healthy expression';
          break;
        case 'recht':
          prompt += 'Show them as a legal professional in formal business attire, in a law office setting, authoritative and trustworthy expression';
          break;
        case 'onderzoek':
          prompt += 'Show them as a research professional in professional attire, in a laboratory setting, intellectual and curious expression';
          break;
        case 'maatschappij':
          prompt += 'Show them as a social professional in professional attire, in a community environment, empathetic and engaged expression';
          break;
        default:
          prompt += 'Show them as a professional in their chosen field, in professional attire, confident and successful expression';
      }
      
      prompt += ', high quality professional photography, natural lighting, realistic';
      
      console.log('🎨 Career transformation prompt:', prompt);
      
      // Convert base64 to buffer
      const imageBuffer = Buffer.from(uploadedImageBase64.replace(/^data:image\/[a-z]+;base64,/, ''), 'base64');
      
      // Create a temporary file-like object for OpenAI
      const imageFile = new File([imageBuffer], 'uploaded-image.jpg', { type: 'image/jpeg' });
      
      // Use OpenAI image editing
      response = await openai.images.edit({
        model: "dall-e-2", // Note: dall-e-2 for editing, dall-e-3 for generation
        image: imageFile,
        prompt: prompt,
      });
      
      console.log('✅ OpenAI Image Edit completed successfully');
      
    } else {
      // Fallback to regular image generation if no uploaded image
      console.log('🎨 No uploaded image found, generating generic career image');
      
      let prompt = `Professional portrait of a successful ${specificRole || careerField} specialist. `;
      
      // Add field-specific details for generation
      switch(careerField) {
        case 'zorg':
          prompt += 'Healthcare professional in modern medical environment, confident and caring, wearing professional medical attire, warm lighting, approachable expression';
          break;
        case 'onderwijs':
          prompt += 'Educator in classroom or educational setting, inspiring and knowledgeable, professional teaching attire, bright educational environment';
          break;
        case 'techniek':
          prompt += 'Technology professional in modern tech workspace, innovative and focused, smart casual professional attire, modern office or lab setting';
          break;
        case 'business':
          prompt += 'Business professional in corporate environment, confident and successful, business professional attire, modern office setting';
          break;
        case 'creativiteit':
          prompt += 'Creative professional in artistic workspace, inspiring and artistic, stylish professional attire, creative studio environment';
          break;
        case 'sport':
          prompt += 'Sports professional in athletic environment, energetic and healthy, athletic professional wear, sports facility or outdoor setting';
          break;
        case 'recht':
          prompt += 'Legal professional in law office, authoritative and trustworthy, formal business attire, professional law office setting';
          break;
        case 'onderzoek':
          prompt += 'Research professional in laboratory or academic setting, intellectual and curious, professional research attire, modern research facility';
          break;
        case 'maatschappij':
          prompt += 'Social professional in community setting, empathetic and engaged, professional social work attire, community or office environment';
          break;
        default:
          prompt += 'Professional in their chosen field, confident and successful, professional attire, modern workplace';
      }
      
      prompt += ', high quality professional photography, natural lighting, realistic, detailed';
      
      response = await openai.images.generate({
        model: "dall-e-3",
        prompt: prompt,
        n: 1,
        size: "1024x1024",
        quality: "standard",
        response_format: "b64_json"
      });
    }
    
    // Handle response
    if (!response.data || response.data.length === 0) {
      console.error('No image returned from OpenAI API');
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ 
          success: false, 
          message: 'No image returned from OpenAI API' 
        })
      };
    }

    const image_base64 = response.data[0].b64_json;
    if (!image_base64) {
      console.error('No base64 image data returned from OpenAI API');
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ 
          success: false, 
          message: 'No base64 image data returned from OpenAI API' 
        })
      };
    }

    // For Netlify, we return the base64 image directly since we can't store files
    const dataUrl = `data:image/png;base64,${image_base64}`;
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ 
        success: true,
        careerImageUrl: dataUrl,
        careerField: careerField,
        specificRole: specificRole || careerField,
        message: userMessage || 'Career visualization generated successfully!',
        usedUploadedImage: !!uploadedImageBase64
      })
    };
    
  } catch (error) {
    console.error('❌ Error with career visualization:', error);
    
    // Handle specific OpenAI API errors
    let errorMessage = 'The image editing AI model is currently unavailable. Please try again later.';
    
    if (error.code === 'invalid_request_error') {
      errorMessage = 'Invalid image format. Please use a clear photo with a person facing the camera.';
    } else if (error.code === 'rate_limit_exceeded') {
      errorMessage = 'Too many requests. Please wait a moment and try again.';
    } else if (error.message?.includes('content_policy_violation')) {
      errorMessage = 'Image content not suitable for editing. Please use a different photo.';
    }
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ 
        success: false, 
        message: errorMessage,
        error: error.message 
      })
    };
  }
}