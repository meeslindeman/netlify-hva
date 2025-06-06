const express = require('express');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
require('dotenv').config();

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

// Run assistant endpoint - UPDATED VERSION
app.post('/api/threads/:threadId/runs', async (req, res) => {
  try {
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
    
    // Log the response for debugging
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

// Generate image endpoint - UPDATED
app.post('/api/generate-image', async (req, res) => {
  try {
    const { prompt } = req.body;
    
    const requestBody = {
      model: "dall-e-3",
      prompt: prompt,
      n: 1,
      size: "1024x1024",
      quality: "standard",
      response_format: "b64_json"  // Always use base64
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

// In your server file, update the upload endpoint:
app.post('/api/upload-file', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }
    
    console.log('📁 File received:', req.file.originalname, req.file.mimetype, req.file.size);
    
    const formData = new FormData();
    formData.append('file', new Blob([req.file.buffer], { type: req.file.mimetype }), req.file.originalname);
    formData.append('purpose', 'assistants'); // Make sure this is 'assistants'
    
    const response = await fetch('https://api.openai.com/v1/files', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: formData
    });
    
    const data = await response.json();
    console.log('📁 OpenAI file upload response:', data); // This will show if upload worked
    
    res.json(data);
  } catch (error) {
    console.error('File upload error:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});


// Serve the main HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('OpenAI Assistant ready!');
});

