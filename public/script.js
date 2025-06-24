// Global variables
let threadId = null;
let uploadedImageBase64 = null; // Store uploaded image in memory for Netlify
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const chatContainer = document.getElementById('chat-container');
const welcomeScreen = document.getElementById('welcome-screen');
const typingIndicator = document.getElementById('typing-indicator');

// Auto-resize textarea
messageInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 120) + 'px';
});

// Send message on Enter (but not Shift+Enter)
messageInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

function sendSuggestion(text) {
    messageInput.value = text;
    sendMessage();
}

async function sendMessage() {
    const message = messageInput.value.trim();
    if (!message) return;

    // Hide welcome screen and show chat
    if (welcomeScreen.style.display !== 'none') {
        welcomeScreen.style.display = 'none';
        chatContainer.style.display = 'block';
    }

    // Add user message
    addMessage(message, 'user');
    messageInput.value = '';
    messageInput.style.height = 'auto';

    // Show typing indicator
    showTyping();

    try {
        // Create thread if it doesn't exist
        if (!threadId) {
            threadId = await createThread();
        }

        // Send message to assistant
        await addMessageToThread(threadId, message);
        const response = await runAssistant(threadId);
        
        hideTyping();
        addMessage(response, 'assistant');
    } catch (error) {
        hideTyping();
        console.error('Error:', error);
        addMessage('Sorry, I encountered an error. Please try again.', 'assistant');
    }
}

// Server-side API calls (now using Netlify Functions)
async function createThread() {
    const response = await fetch('/api/create-thread', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    });
    
    const data = await response.json();
    return data.id;
}

async function addMessageToThread(threadId, content) {
    const response = await fetch(`/api/add-message`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            threadId: threadId,
            content: content
        })
    });
    
    return await response.json();
}

async function runAssistant(threadId) {
    console.log('🚀 Starting assistant run for thread:', threadId);
    
    // Start the run
    const runResponse = await fetch(`/api/run-assistant`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ threadId: threadId })
    });
    
    const run = await runResponse.json();
    console.log('🔄 Run created:', run.id, 'Status:', run.status);
    
    if (!run.id) {
        console.error('❌ No run ID returned:', run);
        throw new Error('Failed to create run - no ID returned');
    }
    
    // Poll for completion and handle function calls
    let runStatus = await pollRunStatus(threadId, run.id);
    let maxIterations = 5;
    let iteration = 0;
    let generatedCareerData = null; // Track if we already generated career visualization
    
    while (runStatus.status === 'requires_action' && iteration < maxIterations) {
        iteration++;
        console.log(`🔧 Assistant requires action (iteration ${iteration}) - processing function calls...`);
        
        const toolCalls = runStatus.required_action.submit_tool_outputs.tool_calls;
        const toolOutputs = [];
        
        for (const toolCall of toolCalls) {
            console.log('🔧 Processing function call:', toolCall.function.name);
            
            if (toolCall.function.name === 'generate_career_visualization') {
                try {
                    // Check if we already generated career visualization
                    if (generatedCareerData) {
                        console.log('🔄 Career visualization already generated, using cached result');
                        toolOutputs.push({
                            tool_call_id: toolCall.id,
                            output: `SUCCESS: Career visualization already generated. ${generatedCareerData}`
                        });
                        continue;
                    }
                    
                    const args = JSON.parse(toolCall.function.arguments);
                    console.log('👔 generate_career_visualization arguments:', args);
                    
                    // Show user message if provided
                    if (args.userMessage) {
                        addMessage(args.userMessage, 'assistant');
                    }
                    
                    const careerResult = await generateCareerVisualization({
                        ...args,
                        threadId: threadId,
                        uploadedImageBase64: uploadedImageBase64 // Pass the stored image
                    });
                    console.log('🖼️ Career visualization result:', careerResult ? 'Success' : 'Failed');
                    
                    if (careerResult && careerResult.success) {
                        generatedCareerData = `Career visualization generated successfully for ${args.careerField}${args.specificRole ? ` as ${args.specificRole}` : ''}. Image URL: ${careerResult.careerImageUrl}`;
                        
                        toolOutputs.push({
                            tool_call_id: toolCall.id,
                            output: `SUCCESS: ${generatedCareerData}`
                        });
                        
                        // Display the career visualization immediately
                        const careerMessage = `
                            Here is your professional future as a ${args.specificRole || args.careerField} specialist! 👨‍💼👩‍💼
                            
                            ![Your Career Future](${careerResult.careerImageUrl})
                            
                            This is what you could look like in your dream career. What do you think?
                        `;
                        addMessage(careerMessage, 'assistant');
                        
                    } else {
                        const errorMsg = careerResult?.message || 'Failed to generate career visualization';
                        toolOutputs.push({
                            tool_call_id: toolCall.id,
                            output: `ERROR: ${errorMsg}`
                        });
                    }
                } catch (error) {
                    console.error('❌ Error processing generate_career_visualization:', error);
                    toolOutputs.push({
                        tool_call_id: toolCall.id,
                        output: `ERROR: Failed to generate career visualization - ${error.message}`
                    });
                }
            } else if (toolCall.function.name === 'generate_image') {
                try {
                    const args = JSON.parse(toolCall.function.arguments);
                    console.log('🎨 generate_image arguments:', args);
                    
                    const imageResult = await generateImage(args.prompt);
                    console.log('🖼️ Image generation result:', imageResult ? 'Success' : 'Failed');
                    
                    if (imageResult) {
                        toolOutputs.push({
                            tool_call_id: toolCall.id,
                            output: `TASK COMPLETED: Successfully generated image. Image data: ${imageResult.data}`
                        });
                    } else {
                        toolOutputs.push({
                            tool_call_id: toolCall.id,
                            output: "Failed to generate image - please try a different approach"
                        });
                    }
                } catch (error) {
                    console.error('❌ Error processing generate_image:', error);
                    toolOutputs.push({
                        tool_call_id: toolCall.id,
                        output: "Error generating image"
                    });
                }
            } else {
                console.log('❓ Unknown function call:', toolCall.function.name);
                toolOutputs.push({
                    tool_call_id: toolCall.id,
                    output: `Unknown function: ${toolCall.function.name}`
                });
            }
        }
        
        console.log('📤 Submitting tool outputs:', toolOutputs.length, 'outputs');
        
        const submitResponse = await fetch(`/api/submit-tool-outputs`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                threadId: threadId,
                runId: run.id,
                tool_outputs: toolOutputs
            })
        });
        
        if (!submitResponse.ok) {
            const submitResult = await submitResponse.json();
            console.error('Failed to submit tool outputs:', submitResult);
            throw new Error(`Failed to submit tool outputs: ${submitResult.error || 'Unknown error'}`);
        }
        
        runStatus = await pollRunStatus(threadId, run.id);
        console.log(`🔄 After tool submission - Status: ${runStatus.status}`);
        
        // If we generated career visualization and assistant still requires action, 
        // break the loop to prevent infinite generation
        if (generatedCareerData && runStatus.status === 'requires_action') {
            console.log('🛑 Forcing completion - career visualization already generated');
            break;
        }
    }
    
    // Handle case where career visualization was generated but run didn't complete normally
    if (generatedCareerData && runStatus.status === 'requires_action') {
        console.log('✅ Career visualization generated successfully, treating as completed');
        return `Career visualization has been generated successfully. You can continue the conversation!`;
    }
    
    if (runStatus.status === 'completed') {
        console.log('✅ Assistant run completed successfully');
        
        const messagesResponse = await fetch(`/api/get-messages?threadId=${threadId}`);
        const messages = await messagesResponse.json();
        const lastMessage = messages.data[0];
        return lastMessage.content[0].text.value;
    } else {
        console.error('❌ Run failed with status:', runStatus.status);
        if (runStatus.last_error) {
            console.error('❌ Last error:', runStatus.last_error);
        }
        if (iteration >= maxIterations) {
            console.error('❌ Max iterations reached - possible infinite loop');
        }
        throw new Error(`Run failed with status: ${runStatus.status}`);
    }
}

async function pollRunStatus(threadId, runId) {
    let status = 'in_progress';
    let attempts = 0;
    let runData = null;
    const maxAttempts = 120;
    
    console.log('⏳ Starting to poll run status...');
    
    while (status === 'in_progress' || status === 'queued') {
        if (attempts >= maxAttempts) {
            console.error('❌ Request timeout after', maxAttempts, 'attempts');
            throw new Error('Request timeout - assistant took too long');
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const response = await fetch(`/api/get-run-status?threadId=${threadId}&runId=${runId}`);
        runData = await response.json();
        status = runData.status;
        attempts++;
        
        if (attempts % 10 === 0) {
            console.log(`⏳ Still waiting... Status: ${status}, Attempt: ${attempts}/${maxAttempts}`);
        }
        
        if (status === 'requires_action' || status === 'completed' || status === 'failed' || status === 'cancelled' || status === 'expired') {
            console.log('🏁 Final status reached:', status);
            break;
        }
    }
    
    return runData;
}

// Generate career visualization via Netlify Function
async function generateCareerVisualization(args) {
    console.log('👔 generateCareerVisualization() called with args:', args);
    
    try {
        const response = await fetch('/api/generate-career-visualization', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(args)
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            console.error('❌ Career visualization API error:', response.status, errorData);
            return { success: false, message: errorData.message || 'Failed to generate career visualization' };
        }
        
        const data = await response.json();
        console.log('📊 Career visualization response:', data.success ? 'Success' : 'Failed');
        
        return data;
    } catch (error) {
        console.error('💥 Error in generateCareerVisualization():', error);
        return { success: false, message: error.message };
    }
}

// Generate image via Netlify Function
async function generateImage(prompt) {
    console.log('🎨 generateImage() called with prompt:', prompt);
    
    try {
        const response = await fetch('/api/generate-image', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ prompt: prompt })
        });
        
        if (!response.ok) {
            console.error('❌ Image generation API error:', response.status);
            return null;
        }
        
        const data = await response.json();
        console.log('📊 Image generation response type:', data.type);
        
        return data;
    } catch (error) {
        console.error('💥 Error in generateImage():', error);
        return null;
    }
}

function addMessage(text, sender) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}`;
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.innerHTML = formatMessage(text);
    
    messageDiv.appendChild(contentDiv);
    chatContainer.insertBefore(messageDiv, typingIndicator);
    
    // Scroll to bottom
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function formatMessage(text) {
    console.log('📝 Original message:', text);
    
    let processedText = text;
    
    // Handle "Generated image:" text with base64 data
    processedText = processedText.replace(/Generated image:\s*(data:image\/[^;\s]+;base64,[A-Za-z0-9+/=]+)/gi, function(match, dataUrl) {
        console.log('🖼️ Found generated image text with base64');
        return `<img src="${dataUrl}" alt="Generated image" style="max-width: 100%; border-radius: 8px; margin: 8px 0; display: block;">`;
    });
    
    // Handle markdown links with images
    processedText = processedText.replace(/\[([^\]]*)\]\(((?:data:image\/[^)]+|https:\/\/[^)]+))\)/gi, function(match, alt, url) {
        console.log('🖼️ Found markdown image:', alt, url.startsWith('data:') ? 'base64' : 'URL');
        return `<img src="${url}" alt="${alt}" style="max-width: 100%; border-radius: 8px; margin: 8px 0; display: block;">`;
    });
    
    // Basic formatting
    processedText = processedText
        .replace(/```([\s\S]*?)```/g, '<pre style="background: #f1f5f9; padding: 12px; border-radius: 6px; margin: 8px 0;"><code>$1</code></pre>')
        .replace(/`([^`]+)`/g, '<code style="background: #f1f5f9; padding: 2px 4px; border-radius: 3px;">$1</code>')
        .replace(/\n/g, '<br>');
    
    console.log('✅ Processed message');
    return processedText;
}

function showTyping() {
    typingIndicator.style.display = 'block';
    sendBtn.disabled = true;
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function hideTyping() {
    typingIndicator.style.display = 'none';
    sendBtn.disabled = false;
}

// Initialize image upload functionality
function initializeImageUpload() {
    const uploadBtn = document.getElementById('uploadBtn');
    const fileInput = document.getElementById('imageFileInput');
    
    if (!uploadBtn || !fileInput) {
        console.error('Upload button or file input not found');
        return;
    }
    
    uploadBtn.addEventListener('click', () => {
        fileInput.click();
    });
    
    fileInput.addEventListener('change', handleImageUpload);
    
    console.log('📷 Image upload functionality initialized');
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function addImageMessage(base64Image, fileName) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message user';
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.innerHTML = `
        <img src="${base64Image}" alt="${fileName}" style="max-width: 100%; border-radius: 8px; margin-bottom: 8px; display: block;">
        <p style="margin: 0; font-size: 0.9em; opacity: 0.8;">📷 Photo uploaded: ${fileName}</p>
    `;
    
    messageDiv.appendChild(contentDiv);
    chatContainer.insertBefore(messageDiv, typingIndicator);
    
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Simplified image upload handler for Netlify (stores in memory)
async function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    console.log('📸 Image uploaded:', file.name, file.type, file.size);

    if (!file.type.startsWith('image/')) {
        alert('Please select an image file.');
        return;
    }

    if (file.size > 20 * 1024 * 1024) {
        alert('Image too large. Please select an image under 20MB.');
        return;
    }

    try {
        const base64Image = await fileToBase64(file);
        console.log('📝 Image converted to base64');

        // Store the image in memory for later use
        uploadedImageBase64 = base64Image;

        const welcomeScreen = document.getElementById('welcome-screen');
        const chatContainer = document.getElementById('chat-container');

        if (welcomeScreen && welcomeScreen.style.display !== 'none') {
            welcomeScreen.style.display = 'none';
            chatContainer.style.display = 'block';
        }

        addImageMessage(base64Image, file.name);
        showTyping();

        // Create thread if it doesn't exist
        if (!threadId) {
            threadId = await createThread();
        }
        
        // Send a message about the uploaded image to the assistant
        await addMessageToThread(threadId, 'I uploaded an image. Please analyze it and tell me what you see.');
        
        const response = await runAssistant(threadId);
        
        hideTyping();
        addMessage(response, 'assistant');

    } catch (error) {
        hideTyping();
        console.error('Error processing image:', error);
        addMessage('Sorry, there was an error processing your image. Please try again.', 'assistant');
    }

    // Clear the input
    event.target.value = '';
}

// Focus input on load
messageInput.focus();

// Test API connection on load
async function testConnection() {
    console.log('✅ Ready to chat with your GPT Assistant on Netlify!');
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initializeImageUpload();
        testConnection();
    });
} else {
    initializeImageUpload();
    testConnection();
}