// Updated script.js for Netlify Functions

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

// Updated API calls for Netlify Functions
async function createThread() {
    const response = await fetch('/.netlify/functions/threads', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    });
    
    const data = await response.json();
    return data.id;
}

async function addMessageToThread(threadId, content) {
    const response = await fetch('/.netlify/functions/add-message', {
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
    const runResponse = await fetch('/.netlify/functions/run-assistant', {
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
    
    // Poll for completion and handle multiple function calls
    let runStatus = await pollRunStatus(threadId, run.id);
    let maxIterations = 3;
    let iteration = 0;
    let generatedImageData = null;
    
    while (runStatus.status === 'requires_action' && iteration < maxIterations) {
        iteration++;
        console.log(`🔧 Assistant requires action (iteration ${iteration}) - processing function calls...`);
        
        const toolCalls = runStatus.required_action.submit_tool_outputs.tool_calls;
        const toolOutputs = [];
        
        for (const toolCall of toolCalls) {
            console.log('🔧 Processing function call:', toolCall.function.name);
            
            if (toolCall.function.name === 'generate_image') {
                try {
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
                    
                    const imageResult = await generateImage(args.prompt);
                    console.log('🖼️ Image generation result:', imageResult ? 'Success' : 'Failed');
                    
                    if (imageResult) {
                        generatedImageData = imageResult.data;
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
        
        const submitResponse = await fetch('/.netlify/functions/submit-tool-outputs', {
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
        
        if (generatedImageData && runStatus.status === 'requires_action') {
            console.log('🛑 Forcing completion - image already generated');
            break;
        }
    }
    
    if (generatedImageData && runStatus.status === 'requires_action') {
        console.log('✅ Image generated successfully, treating as completed');
        return `I have successfully generated an aged version of the uploaded image. Here is the result: ![Aged Version](${generatedImageData})`;
    }
    
    if (runStatus.status === 'completed') {
        console.log('✅ Assistant run completed successfully');
        
        const messagesResponse = await fetch(`/.netlify/functions/messages?threadId=${threadId}`);
        const messages = await messagesResponse.json();
        let lastMessage = messages.data[0].content[0].text.value;
        
        // Check if the message contains a DALL-E prompt
        if (lastMessage.includes('**DALLE_PROMPT_START**') && lastMessage.includes('**DALLE_PROMPT_END**')) {
            console.log('🎨 Found DALL-E prompt in response');
            
            const promptMatch = lastMessage.match(/\*\*DALLE_PROMPT_START\*\*([\s\S]*?)\*\*DALLE_PROMPT_END\*\*/);
            
            if (promptMatch) {
                const dallePrompt = promptMatch[1].trim();
                console.log('🎨 Extracted DALL-E prompt:', dallePrompt);
                
                // Show a loading message while generating image
                const loadingMessage = lastMessage.replace(
                    /\*\*DALLE_PROMPT_START\*\*[\s\S]*?\*\*DALLE_PROMPT_END\*\*/,
                    '🎨 *Ik ben je toekomstbeeld aan het maken... Dit kan even duren.*'
                );
                
                // Return the loading message first, then handle image generation asynchronously
                setTimeout(async () => {
                    showTyping();
                    
                    try {
                        const imageResponse = await fetch('/.netlify/functions/generate-career-image', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ prompt: dallePrompt })
                        });
                        
                        const imageResult = await imageResponse.json();
                        
                        hideTyping();
                        
                        if (imageResult.success) {
                            console.log('✅ DALL-E image generated successfully');
                            
                            // Replace the loading message with the actual image
                            const finalMessage = lastMessage.replace(
                                /\*\*DALLE_PROMPT_START\*\*[\s\S]*?\*\*DALLE_PROMPT_END\*\*/,
                                `![Je toekomstige professionele zelf](${imageResult.imageUrl})\n\n*Zo zou je eruit kunnen zien in je gekozen carrière!*`
                            );
                            
                            // Remove the last assistant message (loading) and add the final message
                            const messages = document.querySelectorAll('.message.assistant');
                            const lastAssistantMessage = messages[messages.length - 1];
                            if (lastAssistantMessage && lastAssistantMessage.textContent.includes('toekomstbeeld aan het maken')) {
                                lastAssistantMessage.remove();
                            }
                            
                            addMessage(finalMessage, 'assistant');
                            
                        } else {
                            console.error('❌ DALL-E image generation failed:', imageResult.error);
                            
                            // Replace with error message
                            const errorMessage = lastMessage.replace(
                                /\*\*DALLE_PROMPT_START\*\*[\s\S]*?\*\*DALLE_PROMPT_END\*\*/,
                                `❌ *Sorry, ik kon geen afbeelding genereren. ${imageResult.message || 'Probeer het later opnieuw.'}*\n\nLaten we gewoon verder gaan met het gesprek over je studiekeuze!`
                            );
                            
                            // Remove the loading message and add the error message
                            const messages = document.querySelectorAll('.message.assistant');
                            const lastAssistantMessage = messages[messages.length - 1];
                            if (lastAssistantMessage && lastAssistantMessage.textContent.includes('toekomstbeeld aan het maken')) {
                                lastAssistantMessage.remove();
                            }
                            
                            addMessage(errorMessage, 'assistant');
                        }
                        
                    } catch (error) {
                        console.error('💥 Error calling DALL-E function:', error);
                        
                        hideTyping();
                        
                        // Remove loading message and show error
                        const messages = document.querySelectorAll('.message.assistant');
                        const lastAssistantMessage = messages[messages.length - 1];
                        if (lastAssistantMessage && lastAssistantMessage.textContent.includes('toekomstbeeld aan het maken')) {
                            lastAssistantMessage.remove();
                        }
                        
                        const errorMessage = lastMessage.replace(
                            /\*\*DALLE_PROMPT_START\*\*[\s\S]*?\*\*DALLE_PROMPT_END\*\*/,
                            '❌ *Er ging iets mis met het genereren van de afbeelding. Laten we verder gaan met het gesprek!*'
                        );
                        
                        addMessage(errorMessage, 'assistant');
                    }
                }, 100);
                
                // Return the loading message immediately
                return loadingMessage;
            }
        }
        
        // Normal message without DALL-E prompt
        return lastMessage;
        
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
        
        const response = await fetch(`/.netlify/functions/run-status?threadId=${threadId}&runId=${runId}`);
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

// Generate image via Netlify function
async function generateImage(prompt) {
    console.log('🎨 generateImage() called with prompt:', prompt);
    
    try {
        const response = await fetch('/.netlify/functions/generate-image', {
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

// Updated handleImageUpload function for the new coaching approach

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

        const welcomeScreen = document.getElementById('welcome-screen');
        const chatContainer = document.getElementById('chat-container');

        if (welcomeScreen && welcomeScreen.style.display !== 'none') {
            welcomeScreen.style.display = 'none';
            chatContainer.style.display = 'block';
        }

        addImageMessage(base64Image, file.name);
        
        // Store the uploaded image for the assistant to reference
        window.uploadedUserImage = base64Image;
        
        // Send context to the assistant about the photo upload
        if (!threadId) {
            threadId = await createThread();
        }
        
        showTyping();
        
        const contextMessage = `De student heeft zojuist een foto van zichzelf geüpload. Reageer enthousiast hierop en leg uit dat je deze foto zult gebruiken om later hun toekomstige professionele zelf te visualiseren zodra je meer weet over hun carrièredoelen. Ga door met je normale gespreksstructuur om hun waarden en toekomstvisie te ontdekken.`;
        
        await addMessageToThread(threadId, contextMessage);
        const response = await runAssistant(threadId);
        
        hideTyping();
        if (response) {
            addMessage(response, 'assistant');
        }

    } catch (error) {
        hideTyping();
        console.error('Error processing image:', error);
        addMessage('Sorry, er was een fout bij het verwerken van je foto. Probeer het opnieuw!', 'assistant');
    }

    event.target.value = '';
}

// Rest of the functions remain the same
function addMessage(text, sender) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}`;
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.innerHTML = formatMessage(text);
    
    messageDiv.appendChild(contentDiv);
    chatContainer.insertBefore(messageDiv, typingIndicator);
    
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function formatMessage(text) {
    console.log('📝 Original message:', text);
    
    let processedText = text;
    
    processedText = processedText.replace(/Generated image:\s*(data:image\/[^;\s]+;base64,[A-Za-z0-9+/=]+)/gi, function(match, dataUrl) {
        console.log('🖼️ Found generated image text with base64');
        return `<img src="${dataUrl}" alt="Generated image" style="max-width: 100%; border-radius: 8px; margin: 8px 0; display: block;">`;
    });
    
    processedText = processedText.replace(/Generated image:\s*(https:\/\/[^\s]+)/gi, function(match, url) {
        console.log('🖼️ Found generated image text with URL');
        
        const containerId = 'img_container_' + Math.random().toString(36).substr(2, 9);
        
        setTimeout(() => {
            handleImageLoading(url, "Generated image", containerId);
        }, 100);
        
        return `<div id="${containerId}">Loading image...</div>`;
    });
    
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

// Focus input on load
messageInput.focus();

// Test API connection on load
async function testConnection() {
    console.log('✅ Ready to chat with your GPT Assistant!');
}

// Test connection when page loads
window.addEventListener('load', testConnection);

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeImageUpload);
} else {
    initializeImageUpload();
}