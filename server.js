const express = require('express');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const Replicate = require('replicate');
require('dotenv').config();

// Initialize Replicate client
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

// Fix for fetch in Node.js
let fetch;
(async () => {
  if (typeof globalThis.fetch === 'undefined') {
    const { default: nodeFetch } = await import('node-fetch');
    fetch = nodeFetch;
  } else {
    fetch = globalThis.fetch;
  }
})();

async function getFetch() {
  if (typeof globalThis.fetch !== 'undefined') {
    return globalThis.fetch;
  }
  const { default: nodeFetch } = await import('node-fetch');
  return nodeFetch;
}

const app = express();
const PORT = process.env.PORT || 3000;

// Configure multer for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 } // 20MB limit
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// Create thread endpoint
app.post('/api/threads', async (req, res) => {
  try {
    const fetch = await getFetch();
    
    const response = await fetch('https://api.openai.com/v1/threads', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v2'
      }
    });
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Thread creation error:', error);
    res.status(500).json({ error: 'Failed to create thread' });
  }
});

// Add message to thread endpoint
app.post('/api/threads/:threadId/messages', async (req, res) => {
  try {
    const fetch = await getFetch();
    const { threadId } = req.params;
    const { content, attachments } = req.body;
    
    const messageData = {
      role: 'user',
      content: content
    };
    
    if (attachments) {
      messageData.attachments = attachments;
    }
    
    const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v2'
      },
      body: JSON.stringify(messageData)
    });
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Message addition error:', error);
    res.status(500).json({ error: 'Failed to add message to thread' });
  }
});

// Run assistant endpoint
app.post('/api/threads/:threadId/runs', async (req, res) => {
  try {
    const fetch = await getFetch();
    const { threadId } = req.params;
    
    const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v2'
      },
      body: JSON.stringify({
        assistant_id: process.env.ASSISTANT_ID,
        tools: [
          {
            type: "file_search"
          },
          {
            type: "code_interpreter"
          },
          {
            type: "function",
            function: {
              name: "generate_image",
              description: "Generate an image using DALL-E based on a text prompt",
              parameters: {
                type: "object",
                properties: {
                  prompt: {
                    type: "string",
                    description: "Detailed description of the image to generate"
                  }
                },
                required: ["prompt"]
              }
            }
          }
        ]
      })
    });
    
    const data = await response.json();
    console.log('Assistant run created:', data);
    res.json(data);
  } catch (error) {
    console.error('Run creation error:', error);
    res.status(500).json({ error: 'Failed to create run' });
  }
});

// Check run status endpoint
app.get('/api/threads/:threadId/runs/:runId', async (req, res) => {
  try {
    const fetch = await getFetch();
    const { threadId, runId } = req.params;
    
    const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${runId}`, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'OpenAI-Beta': 'assistants=v2'
      }
    });
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Run status error:', error);
    res.status(500).json({ error: 'Failed to get run status' });
  }
});

// Submit tool outputs endpoint
app.post('/api/threads/:threadId/runs/:runId/submit_tool_outputs', async (req, res) => {
  try {
    const fetch = await getFetch();
    const { threadId, runId } = req.params;
    const { tool_outputs } = req.body;
    
    const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${runId}/submit_tool_outputs`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v2'
      },
      body: JSON.stringify({ tool_outputs })
    });
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Tool outputs error:', error);
    res.status(500).json({ error: 'Failed to submit tool outputs' });
  }
});

// Get messages endpoint
app.get('/api/threads/:threadId/messages', async (req, res) => {
  try {
    const fetch = await getFetch();
    const { threadId } = req.params;
    
    const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'OpenAI-Beta': 'assistants=v2'
      }
    });
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Messages retrieval error:', error);
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

// Generate image endpoint (for OpenAI DALL-E)
app.post('/api/generate-image', async (req, res) => {
  try {
    const fetch = await getFetch();
    const { prompt } = req.body;
    
    const requestBody = {
      model: "dall-e-3",
      prompt: prompt,
      n: 1,
      size: "1024x1024",
      quality: "standard",
      response_format: "b64_json"
    };
    
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('DALL-E API error:', errorText);
      return res.status(response.status).json({ error: 'Failed to generate image' });
    }
    
    const data = await response.json();
    
    if (data.data && data.data[0] && data.data[0].b64_json) {
      const base64Image = data.data[0].b64_json;
      const dataUrl = `data:image/png;base64,${base64Image}`;
      return res.json({ type: 'base64', data: dataUrl });
    }
    
    res.status(500).json({ error: 'No image data in response' });
  } catch (error) {
    console.error('Image generation error:', error);
    res.status(500).json({ error: 'Failed to generate image' });
  }
});

// File upload endpoint
app.post('/api/upload-file', upload.single('file'), async (req, res) => {
  try {
    const fetch = await getFetch();
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }
    
    console.log('📁 File received:', req.file.originalname, req.file.mimetype, req.file.size);
    
    const FormData = (await import('form-data')).default;
    const formData = new FormData();
    formData.append('file', req.file.buffer, {
      filename: req.file.originalname,
      contentType: req.file.mimetype
    });
    formData.append('purpose', 'assistants');
    
    const response = await fetch('https://api.openai.com/v1/files', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        ...formData.getHeaders()
      },
      body: formData
    });
    
    const data = await response.json();
    console.log('📁 OpenAI file upload response:', data);
    res.json(data);
  } catch (error) {
    console.error('File upload error:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// REPLICATE ROUTES - Using Official Client

// Face aging route using yuval-alaluf/sam model
app.post('/api/age-face', async (req, res) => {
    try {
        // Target age 70 for "future career self" (assuming students are ~20-25)
        const { imageBase64, ageTarget = 50 } = req.body;
        
        console.log('👴 Aging face using yuval-alaluf/sam model, target age:', ageTarget);
        
        if (!process.env.REPLICATE_API_TOKEN) {
            return res.status(500).json({ error: 'Replicate API token not configured' });
        }
        
        const imageDataUrl = imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;
        
        console.log('🎨 Running yuval-alaluf/sam model...');
        
        const validTargetAge = 50; // Target age for "future career self"
        
        const input = {
            image: imageDataUrl,
            target_age: validTargetAge.toString()
        };

        console.log(`🎯 Using target age: ${validTargetAge} (future career self)`);

        const output = await replicate.run(
            "yuval-alaluf/sam:9222a21c181b707209ef12b5e0d7e94c994b58f01c7b2fec075d2e892362f13c",
            { input }
        );

        console.log('✅ SAM model completed successfully');
        console.log('📊 Output constructor:', output?.constructor?.name);
        
        // Extract URL from FileOutput object
        let imageUrl = null;
        
        if (typeof output === 'string' && output.startsWith('http')) {
            imageUrl = output;
            console.log('✅ Direct string URL found');
        } else if (Array.isArray(output) && output.length > 0) {
            const firstItem = output[0];
            if (typeof firstItem === 'string') {
                imageUrl = firstItem;
            } else if (firstItem && typeof firstItem.url === 'function') {
                const urlResult = await firstItem.url();
                imageUrl = (urlResult && urlResult.href) ? urlResult.href : urlResult;
                console.log('✅ Array FileOutput url() called:', imageUrl);
            }
        } else if (output && typeof output === 'object' && typeof output.url === 'function') {
            const urlResult = await output.url();
            imageUrl = (urlResult && urlResult.href) ? urlResult.href : urlResult;
            console.log('✅ FileOutput url() function called:', imageUrl);
        }
        
        console.log('🖼️ Final extracted image URL:', imageUrl);
        
        if (imageUrl && typeof imageUrl === 'string' && imageUrl.startsWith('http')) {
            res.json({
                success: true,
                agedImageUrl: imageUrl.trim(),
                model: 'yuval-alaluf/sam',
                targetAge: validTargetAge,
                description: `Aged to ${validTargetAge} years old - your future career self!`
            });
        } else {
            console.error('❌ SAM model failed to return valid image URL');
            res.status(500).json({ 
                error: 'SAM aging model failed to generate image',
                message: 'The face aging AI model encountered an issue. Please try with a different photo (clear, well-lit, single person facing camera).'
            });
        }
        
    } catch (error) {
        console.error('❌ Error with SAM model:', error);
        res.status(500).json({ 
            error: 'SAM aging model failed',
            message: 'The face aging AI model is currently unavailable. Please try again later or use a different photo.',
            details: error.message 
        });
    }
});

// Remove the alternative aging method - we only use SAM model now

// Serve the main HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('OpenAI Assistant ready!');
  console.log('Replicate API token:', process.env.REPLICATE_API_TOKEN ? 'Configured ✅' : 'Missing ❌');
  console.log('Using official Replicate client with yuval-alaluf/sam model');
});