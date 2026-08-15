const { verifyToken } = require('../_lib/auth');
const { db } = require('../_lib/firebase');
const { success, error, options } = require('../_lib/response');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'PUT') return res.status(405).json(error('Method not allowed', 405));
  
  try {
    const user = await verifyToken(req);
    const { notificationId, markAll } = req.body;
    
    if (markAll) {
      // Mark all as read
      const snapshot = await db.ref(`notifications/${user.uid}`).once('value');
      const data = snapshot.val();
      
      if (data) {
        const updates = {};
        for (const [key] of Object.entries(data)) {
          updates[`${key}/read`] = true;
        }
        await db.ref(`notifications/${user.uid}`).update(updates);
      }
      
      return res.json(success({ markedAll: true }));
    }
    
    if (!notificationId) {
      return res.status(400).json(error('Notification ID is required', 400));
    }
    
    await db.ref(`notifications/${user.uid}/${notificationId}/read`).set(true);
    
    res.json(success({ read: true }));
  } catch (err) {
    console.error('Mark as read error:', err);
    res.status(500).json(error(err.message, 500));
  }
};