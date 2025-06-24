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
    const { threadId } = JSON.parse(event.body);
    
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
          },
          {
            type: "function",
            function: {
              name: "generate_career_visualization",
              description: "Generate a professional career visualization image based on career field. Only call this when the user explicitly agrees to see their future professional self.",
              parameters: {
                type: "object",
                properties: {
                  careerField: {
                    type: "string",
                    description: "The main career field (e.g., 'zorg', 'onderwijs', 'techniek', 'business', 'creativiteit', 'sport')",
                    enum: [
                      "zorg",
                      "onderwijs", 
                      "techniek",
                      "business",
                      "creativiteit",
                      "sport",
                      "recht",
                      "onderzoek",
                      "maatschappij"
                    ]
                  },
                  specificRole: {
                    type: "string",
                    description: "A more specific role if mentioned (e.g., 'doctor', 'teacher', 'engineer')"
                  },
                  userMessage: {
                    type: "string",
                    description: "A encouraging message to show the user while generating"
                  }
                },
                required: ["careerField"]
              }
            }
          }
        ]
      })
    });
    
    const data = await response.json();
    console.log('Assistant run created:', data);
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(data)
    };
  } catch (error) {
    console.error('Run creation error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: 'Failed to create run' })
    };
  }
}