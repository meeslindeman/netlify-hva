// Global variables
let threadId = null;
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

// Server-side API calls (no API keys exposed)
async function createThread() {
    const response = await fetch('/api/threads', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    });
    
    const data = await response.json();
    return data.id;
}

async function addMessageToThread(threadId, content) {
    const response = await fetch(`/api/threads/${threadId}/messages`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            content: content
        })
    });
    
    return await response.json();
}

async function runAssistant(threadId) {
    console.log('🚀 Starting assistant run for thread:', threadId);
    
    // Start the run
    const runResponse = await fetch(`/api/threads/${threadId}/runs`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    });
    
    const run = await runResponse.json();
    console.log('🔄 Run created:', run.id, 'Status:', run.status);
    
    if (!run.id) {
        console.error('❌ No run ID returned:', run);
        throw new Error('Failed to create run - no ID returned');
    }
    
    // Poll for completion and handle multiple function calls
    let runStatus = await pollRunStatus(threadId, run.id);
    let maxIterations = 3; // Reduce to prevent infinite loops
    let iteration = 0;
    let generatedImageData = null; // Track if we've generated an image
    
    while (runStatus.status === 'requires_action' && iteration < maxIterations) {
        iteration++;
        console.log(`🔧 Assistant requires action (iteration ${iteration}) - processing function calls...`);
        
        const toolCalls = runStatus.required_action.submit_tool_outputs.tool_calls;
        const toolOutputs = [];
        
        for (const toolCall of toolCalls) {
            console.log('🔧 Processing function call:', toolCall.function.name);
            
            if (toolCall.function.name === 'generate_image') {
                try {
                    // If we already generated an image, don't generate again
                    if (generatedImageData) {
                        console.log('🔄 Already generated image, using cached result');
                        toolOutputs.push({
                            tool_call_id: toolCall.id,
                            output: `TASK COMPLETED: Image already generated successfully. Here is the aged version: ${generatedImageData}`
                        });
                        continue;
                    }
                    
                    const args = JSON.parse(toolCall.function.arguments);
                    console.log('🎨 generate_image arguments:', args);
                    
                    // Generate the image via server
                    const imageResult = await generateImage(args.prompt);
                    console.log('🖼️ Image generation result:', imageResult ? 'Success' : 'Failed');
                    
                    if (imageResult) {
                        generatedImageData = imageResult.data; // Cache the result
                        toolOutputs.push({
                            tool_call_id: toolCall.id,
                            output: `TASK COMPLETED: Successfully generated aged image. The aging process is now complete. Please show this aged version to the user and do not generate any more images. Image data: ${imageResult.data}`
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
        
        // Submit tool outputs via server
        const submitResponse = await fetch(`/api/threads/${threadId}/runs/${run.id}/submit_tool_outputs`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                tool_outputs: toolOutputs
            })
        });
        
        if (!submitResponse.ok) {
            const submitResult = await submitResponse.json();
            console.error('Failed to submit tool outputs:', submitResult);
            throw new Error(`Failed to submit tool outputs: ${submitResult.error || 'Unknown error'}`);
        }
        
        // Poll again for next status
        runStatus = await pollRunStatus(threadId, run.id);
        console.log(`🔄 After tool submission - Status: ${runStatus.status}`);
        
        // If we generated an image and it's still requiring action, force completion
        if (generatedImageData && runStatus.status === 'requires_action') {
            console.log('🛑 Forcing completion - image already generated');
            break;
        }
    }
    
    // If we have generated image data but the run is still requiring action, treat as success
    if (generatedImageData && runStatus.status === 'requires_action') {
        console.log('✅ Image generated successfully, treating as completed');
        return `I have successfully generated an aged version of the uploaded image. Here is the result: ![Aged Version](${generatedImageData})`;
    }
    
    if (runStatus.status === 'completed') {
        console.log('✅ Assistant run completed successfully');
        
        // Get the latest message via server
        const messagesResponse = await fetch(`/api/threads/${threadId}/messages`);
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
        
        const response = await fetch(`/api/threads/${threadId}/runs/${runId}`);
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

// Generate image via server API
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
    
    // Handle "Generated image:" text with URLs
    processedText = processedText.replace(/Generated image:\s*(https:\/\/[^\s]+)/gi, function(match, url) {
        console.log('🖼️ Found generated image text with URL');
        
        const containerId = 'img_container_' + Math.random().toString(36).substr(2, 9);
        
        setTimeout(() => {
            handleImageLoading(url, "Generated image", containerId);
        }, 100);
        
        return `<div id="${containerId}">Loading image...</div>`;
    });
    
    // Handle markdown links with images
    processedText = processedText.replace(/\[([^\]]*)\]\(((?:data:image\/[^)]+|https:\/\/[^)]+))\)/gi, function(match, alt, url) {
        console.log('🖼️ Found markdown image:', alt, url.startsWith('data:') ? 'base64' : 'URL');
        
        if (url.startsWith('data:')) {
            return `<img src="${url}" alt="${alt}" style="max-width: 100%; border-radius: 8px; margin: 8px 0; display: block;">`;
        } else {
            const containerId = 'img_container_' + Math.random().toString(36).substr(2, 9);
            
            setTimeout(() => {
                handleImageLoading(url, alt, containerId);
            }, 100);
            
            return `<div id="${containerId}">Loading image...</div>`;
        }
    });
    
    // Clean up any remaining URLs
    processedText = processedText.replace(/(https:\/\/oaidalleapiprodscus\.blob\.core\.windows\.net\/[^\s]+)/gi, '');
    
    // Basic formatting
    processedText = processedText
        .replace(/```([\s\S]*?)```/g, '<pre style="background: #f1f5f9; padding: 12px; border-radius: 6px; margin: 8px 0;"><code>$1</code></pre>')
        .replace(/`([^`]+)`/g, '<code style="background: #f1f5f9; padding: 2px 4px; border-radius: 3px;">$1</code>')
        .replace(/\n/g, '<br>');
    
    console.log('✅ Processed message');
    return processedText;
}

function handleImageLoading(url, alt, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const img = document.createElement('img');
    img.src = url;
    img.alt = alt;
    img.style.maxWidth = '100%';
    img.style.borderRadius = '8px';
    img.style.margin = '8px 0';
    img.style.display = 'block';
    
    img.onload = function() {
        console.log('🎉 Image loaded successfully:', alt);
        container.innerHTML = '';
        container.appendChild(img);
    };
    
    img.onerror = function() {
        console.log('❌ Image failed to load:', alt);
        container.innerHTML = `
            <div style="background: #f1f5f9; border: 2px dashed #94a3b8; border-radius: 8px; padding: 20px; text-align: center; margin: 8px 0;">
                <p style="color: #64748b; margin: 0; font-size: 1.1em;">🎨 ${alt}</p>
                <p style="color: #94a3b8; font-size: 0.9em; margin: 4px 0 0 0;">Image temporarily unavailable</p>
            </div>
        `;
    };
    
    container.innerHTML = 'Loading image...';
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

// Focus input on load
messageInput.focus();

// Test API connection on load
async function testConnection() {
    console.log('✅ Ready to chat with your GPT Assistant!');
}

// Test connection when page loads
window.addEventListener('load', testConnection);

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
    const chatContainer = document.getElementById('chat-container');
    const typingIndicator = document.getElementById('typing-indicator');
    
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

// Enhanced image upload handler with better aging prompt
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
        console.log('📝 Image converted to base64, length:', base64Image.length);

        const welcomeScreen = document.getElementById('welcome-screen');
        const chatContainer = document.getElementById('chat-container');

        if (welcomeScreen && welcomeScreen.style.display !== 'none') {
            welcomeScreen.style.display = 'none';
            chatContainer.style.display = 'block';
        }

        addImageMessage(base64Image, file.name);
        showTyping();

        if (!threadId) {
            threadId = await createThread();
        }

        // Enhanced approach: First upload the file, then send a detailed message
        try {
            console.log('📁 Uploading file to assistant...');
            
            const formData = new FormData();
            formData.append('file', file);

            const fileResponse = await fetch('/api/upload-file', {
                method: 'POST',
                body: formData
            });

            if (fileResponse.ok) {
                const fileData = await fileResponse.json();
                console.log('📁 File uploaded successfully:', fileData.id);

                // Create a comprehensive message for the assistant
                const detailedMessage = {
                    content: `DESCRIBE ONLY: I've uploaded a photo. DO NOT generate any images yet. 

ONLY describe what you see in this uploaded image:
- Is it a man or woman?
- Approximate age?
- Hair color and style?
- Eye color?
- Face shape?
- Skin tone?
- Any distinctive features?

Be very specific about what you observe. Do NOT call generate_image function yet - just describe what you see.`,
                    attachments: [
                        {
                            file_id: fileData.id,
                            tools: [
                                { type: "file_search" },
                                { type: "code_interpreter" }
                            ]
                        }
                    ]
                };

                await addMessageToThreadWithImage(threadId, detailedMessage);
                console.log('✅ Detailed image analysis message sent');
                
                const response = await runAssistant(threadId);
                hideTyping();
                addMessage(response, 'assistant');
                
            } else {
                console.log('⚠️ File upload failed, using fallback approach...');
                throw new Error('File upload failed');
            }
            
        } catch (fileError) {
            console.log('⚠️ File approach failed, using description approach...');
            console.error('File error:', fileError);
            
            // Fallback: Ask assistant to generate a generic aged portrait
            const fallbackMessage = `A student has uploaded their photo for an aging exercise. Since the file upload approach failed, please generate a realistic portrait of a person who appears to be 20-30 years older than a typical college student (so around 40-50 years old).

Create a professional portrait showing:
- Natural aging: wrinkles around eyes (crow's feet), laugh lines, forehead lines
- Graying or salt-and-pepper hair
- More mature facial features
- Gentle age spots or skin texture changes
- Wise, friendly expression
- Professional headshot style
- Realistic human features
- Good lighting and composition

Use the generate_image function to create this aged portrait.`;

            await addMessageToThread(threadId, fallbackMessage);
            
            const response = await runAssistant(threadId);
            hideTyping();
            addMessage(response, 'assistant');
        }

    } catch (error) {
        hideTyping();
        console.error('Error processing image:', error);
        addMessage('Sorry, there was an error processing your photo. Please try again.', 'assistant');
    }

    event.target.value = '';
}

// Enhanced addMessageToThread for image messages
async function addMessageToThreadWithImage(threadId, messageContent) {
    console.log('📤 Sending image message to thread:', threadId);
    console.log('📋 Message content structure:', JSON.stringify(messageContent, null, 2));
    
    const response = await fetch(`/api/threads/${threadId}/messages`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(messageContent)
    });
    
    if (!response.ok) {
        const errorData = await response.json();
        console.error('❌ Error sending image message:', errorData);
        console.error('📋 Response status:', response.status);
        throw new Error(`Failed to send image message: ${JSON.stringify(errorData)}`);
    }
    
    const result = await response.json();
    console.log('✅ Image message sent successfully');
    return result;
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeImageUpload);
} else {
    initializeImageUpload();
}