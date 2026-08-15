const { verifyToken } = require('../_lib/auth');
const { db } = require('../_lib/firebase');
const { success, error, options } = require('../_lib/response');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json(error('Method not allowed', 405));
  
  try {
    const user = await verifyToken(req);
    const { category, subject, message, priority = 'normal' } = req.body;
    
    if (!subject || !message) {
      return res.status(400).json(error('Subject and message are required', 400));
    }
    
    const ticketRef = db.ref('supportTickets').push();
    await ticketRef.set({
      customerUid: user.uid,
      customerName: user.displayName || 'Customer',
      customerEmail: user.email,
      category: category || 'general',
      subject: subject,
      message: message,
      priority: priority,
      status: 'open',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    
    res.json(success({ ticketId: ticketRef.key }));
  } catch (err) {
    console.error('Create ticket error:', err);
    res.status(500).json(error(err.message, 500));
  }
};