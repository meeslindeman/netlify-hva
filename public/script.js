// Updated script.js for Function Calling approach

// Global variables
let threadId = null;
let uploadedUserImage = null; // Store the uploaded image globally
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

// API calls for Netlify Functions
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
    
    // Poll for completion and handle function calls
    let runStatus = await pollRunStatus(threadId, run.id);
    let maxIterations = 5;
    let iteration = 0;
    
    while (runStatus.status === 'requires_action' && iteration < maxIterations) {
        iteration++;
        console.log(`🔧 Assistant requires action (iteration ${iteration}) - processing function calls...`);
        
        const toolCalls = runStatus.required_action.submit_tool_outputs.tool_calls;
        const toolOutputs = [];
        
        for (const toolCall of toolCalls) {
            console.log('🔧 Processing function call:', toolCall.function.name);
            
            if (toolCall.function.name === 'generate_career_visualization') {
                try {
                    const args = JSON.parse(toolCall.function.arguments);
                    console.log('🎨 generate_career_visualization arguments:', args);
                    
                    // Check if we have an uploaded image
                    if (!uploadedUserImage) {
                        toolOutputs.push({
                            tool_call_id: toolCall.id,
                            output: "ERROR: No uploaded image available. Please ask the user to upload a photo first before generating career visualization."
                        });
                        continue;
                    }
                    
                    // Show loading message to user
                    addMessage(`🎨 ${args.userMessage || 'Ik maak nu een beeld van jouw professionele toekomst... Dit kan even duren.'}`, 'assistant');
                    showTyping();
                    
                    const imageResult = await generateCareerImage(
                        uploadedUserImage, 
                        args.careerField, 
                        args.specificRole
                    );
                    
                    hideTyping();
                    
                    if (imageResult && imageResult.success) {
                        // Remove the loading message
                        removeLastAssistantMessage();
                        
                        toolOutputs.push({
                            tool_call_id: toolCall.id,
                            output: `SUCCESS: Career visualization generated successfully. The image shows the user as a professional ${args.careerField} worker. Image URL: ${imageResult.imageUrl}`
                        });
                    } else {
                        // Remove the loading message
                        removeLastAssistantMessage();
                        
                        toolOutputs.push({
                            tool_call_id: toolCall.id,
                            output: `ERROR: Failed to generate career visualization. ${imageResult?.message || 'Please try again later.'}`
                        });
                    }
                    
                } catch (error) {
                    console.error('❌ Error processing generate_career_visualization:', error);
                    hideTyping();
                    removeLastAssistantMessage();
                    
                    toolOutputs.push({
                        tool_call_id: toolCall.id,
                        output: `ERROR: ${error.message}`
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
    }
    
    if (runStatus.status === 'completed') {
        console.log('✅ Assistant run completed successfully');
        
        const messagesResponse = await fetch(`/.netlify/functions/messages?threadId=${threadId}`);
        const messages = await messagesResponse.json();
        let lastMessage = messages.data[0].content[0].text.value;
        
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

// New function to generate career image using the edit approach
async function generateCareerImage(imageData, careerField, specificRole) {
    console.log('🎨 generateCareerImage() called with field:', careerField);
    
    try {
        const response = await fetch('/.netlify/functions/edit-career-image', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                imageData: imageData,
                careerField: careerField,
                specificRole: specificRole
            })
        });
        
        if (!response.ok) {
            console.error('❌ Career image generation API error:', response.status);
            const errorData = await response.json();
            return { success: false, message: errorData.message };
        }
        
        const data = await response.json();
        console.log('📊 Career image generation response:', data.success ? 'Success' : 'Failed');
        
        return data;
    } catch (error) {
        console.error('💥 Error in generateCareerImage():', error);
        return { success: false, message: 'Network error occurred' };
    }
}

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
        
        // Store the uploaded image globally
        uploadedUserImage = base64Image;
        
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

function removeLastAssistantMessage() {
    const messages = document.querySelectorAll('.message.assistant');
    if (messages.length > 0) {
        const lastMessage = messages[messages.length - 1];
        lastMessage.remove();
    }
}

function formatMessage(text) {
    console.log('📝 Original message:', text);
    
    let processedText = text;
    
    // Handle different image URL formats
    processedText = processedText.replace(/Image URL:\s*(data:image\/[^;\s]+;base64,[A-Za-z0-9+/=]+)/gi, function(match, dataUrl) {
        console.log('🖼️ Found career image with base64');
        return `<img src="${dataUrl}" alt="Your professional future" style="max-width: 100%; border-radius: 8px; margin: 8px 0; display: block;">`;
    });
    
    processedText = processedText.replace(/\[([^\]]*)\]\((data:image\/[^)]+)\)/gi, function(match, alt, url) {
        console.log('🖼️ Found markdown image with base64:', alt);
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
    console.log('✅ Ready to chat with your Study Choice Coach!');
}

// Test connection when page loads
window.addEventListener('load', testConnection);

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeImageUpload);
} else {
    initializeImageUpload();
}