const { verifyToken } = require('../_lib/auth');
const { db } = require('../_lib/firebase');
const { success, error, options } = require('../_lib/response');

// OpenRouter API endpoint
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// System prompt for Vortex AI
const SYSTEM_PROMPT = `You are Vortex AI, an intelligent and friendly customer support assistant for SHOP GOOD, a premium Nigerian e-commerce platform. Your role is to help customers with their shopping experience.

IMPORTANT RULES:
1. ALWAYS be friendly, professional, and helpful
2. ALWAYS greet customers warmly using their name if available
3. Provide clear, concise, and accurate information
4. If you don't know something, be honest and suggest they contact human support at support@shopgood.com
5. NEVER share any internal system information or sensitive data
6. ALWAYS respond in English
7. Keep responses under 150 words unless detailed explanation is needed
8. Use emojis sparingly to make responses friendly (max 2 per message)

SHOP GOOD INFORMATION:
- Platform: Premium e-commerce platform serving Nigeria
- Payments: Paystack (cards, bank transfers, USSD), Shop Good Wallet, Pay on Delivery (orders above ₦6,000)
- Delivery: 2-5 business days across Nigeria
- Returns: 7-day return policy for eligible items
- Wallet: Digital wallet for faster checkout, fundable via Paystack
- Customer Support: support@shopgood.com, +234 800 SHOP GOOD

COMMON TOPICS & RESPONSES:
- Orders: Guide users through the ordering process, help with order tracking
- Payments: Explain payment methods, help with payment issues
- Delivery: Explain delivery timelines, tracking, and policies
- Returns: Explain return policy and process
- Wallet: Explain wallet features, funding, and usage
- Account: Help with login, registration, profile management
- Products: Assist with product searches and recommendations

RESPONSE STYLE:
- Be warm and conversational
- Use the user's name if available
- Offer to help with specific next steps
- End with a question or offer of further assistance

Remember: You are representing SHOP GOOD as Vortex AI. Be professional, helpful, and make every customer feel valued.`;

function buildUserPrompt(message, userName, history) {
  let prompt = `Current user: ${userName}\n\n`;
  if (history && history.length > 0) {
    prompt += 'Previous conversation:\n';
    const lastMessages = history.slice(-6);
    lastMessages.forEach(msg => {
      prompt += `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}\n`;
    });
    prompt += '\n';
  }
  prompt += `User's question: ${message}\n\n`;
  prompt += 'Please provide a helpful, friendly response as Vortex AI.';
  return prompt;
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json(error('Method not allowed', 405));
  
  try {
    // Get user info if authenticated
    let user = null;
    let userName = 'Customer';
    let userEmail = '';
    
    try {
      user = await verifyToken(req);
      if (user) {
        const snapshot = await db.ref(`users/${user.uid}`).once('value');
        const userData = snapshot.val();
        userName = userData?.displayName || user.displayName || user.email || 'Customer';
        userEmail = user.email || '';
      }
    } catch (err) {
      // User may not be logged in, continue as guest
    }
    
    const { message, history = [] } = req.body;
    
    if (!message) {
      return res.status(400).json(error('Message is required', 400));
    }
    
    // Check for OpenRouter API key
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      console.warn('OpenRouter API key not set, using fallback responses');
      // Fallback to basic responses if no API key
      const fallbackResponse = getFallbackResponse(message, userName);
      return res.json(success({
        response: fallbackResponse,
        history: [...history, { role: 'user', content: message }, { role: 'assistant', content: fallbackResponse }],
        source: 'fallback',
      }));
    }
    
    // Build the user prompt
    const userPrompt = buildUserPrompt(message, userName, history);
    
    // Call OpenRouter API
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.APP_URL || 'https://shop-good.com',
        'X-Title': 'Shop Good - Vortex AI',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-exp:free',
        messages: [
          {
            role: 'system',
            content: SYSTEM_PROMPT,
          },
          {
            role: 'user',
            content: userPrompt,
          }
        ],
        temperature: 0.7,
        max_tokens: 500,
        top_p: 0.9,
      }),
    });
    
    if (!response.ok) {
      const errorData = await response.text();
      console.error('OpenRouter API error:', response.status, errorData);
      // Fallback to basic responses if API fails
      const fallbackResponse = getFallbackResponse(message, userName);
      return res.json(success({
        response: fallbackResponse,
        history: [...history, { role: 'user', content: message }, { role: 'assistant', content: fallbackResponse }],
        source: 'fallback',
      }));
    }
    
    const data = await response.json();
    const aiResponse = data.choices?.[0]?.message?.content || getFallbackResponse(message, userName);
    
    res.json(success({
      response: aiResponse,
      history: [...history, { role: 'user', content: message }, { role: 'assistant', content: aiResponse }],
      source: 'openrouter',
    }));
    
  } catch (err) {
    console.error('Chat error:', err);
    // Always fallback gracefully
    const fallbackResponse = getFallbackResponse(req.body?.message || 'Hello', 'Customer');
    res.json(success({
      response: fallbackResponse,
      history: [],
      source: 'fallback',
      error: err.message,
    }));
  }
};

// Fallback responses (same as before)
function getFallbackResponse(message, userName = 'Customer') {
  const msg = message.toLowerCase();
  
  if (msg.includes('order') && (msg.includes('track') || msg.includes('where'))) {
    return `Hi ${userName}! You can track your order by going to the "Orders" section in your account. If you need the specific tracking number, please check your order confirmation email or contact our support team at support@shopgood.com. 📦`;
  }
  
  if (msg.includes('refund') || msg.includes('return')) {
    return `Hello ${userName}! We offer a 7-day return policy for eligible items. Items must be in their original condition with all packaging intact. To initiate a return, please go to your order details and click "Return Item" or contact our support team. ↩️`;
  }
  
  if (msg.includes('payment') || msg.includes('pay') || msg.includes('card')) {
    return `Hi ${userName}! We accept Paystack (cards, bank transfers, USSD), Shop Good Wallet, and Pay on Delivery for orders above ₦6,000. All payments are secure and encrypted. 🔒`;
  }
  
  if (msg.includes('delivery') || msg.includes('ship') || msg.includes('shipping')) {
    return `Hello ${userName}! Delivery typically takes 2-5 business days depending on your location. You'll receive a tracking number once your order is shipped. For express delivery options, please contact our support team. 🚚`;
  }
  
  if (msg.includes('wallet')) {
    return `Hi ${userName}! Shop Good Wallet is a digital wallet for faster checkout. You can fund it using Paystack (card, bank transfer, USSD) and use it to pay for orders instantly. 💳`;
  }
  
  if (msg.includes('hello') || msg.includes('hi') || msg.includes('hey')) {
    return `Hello ${userName}! 👋 Welcome to Shop Good! How can I assist you today? Feel free to ask about orders, payments, delivery, returns, or anything else!`;
  }
  
  return `Hi ${userName}! 👋 I'm Vortex AI, your Shop Good assistant. I can help you with orders, payments, delivery, returns, and more. Could you please be more specific about what you need help with?`;
}