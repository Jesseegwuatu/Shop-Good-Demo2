const { verifyToken } = require('../_lib/auth');
const { db } = require('../_lib/firebase');
const { success, error, options } = require('../_lib/response');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json(error('Method not allowed', 405));
  
  try {
    const user = await verifyToken(req);
    const { uid, type, title, message, data = {} } = req.body;
    
    // Users can only send to themselves, or admins can send to anyone
    if (uid !== user.uid) {
      // Check if admin
      const userSnapshot = await db.ref(`users/${user.uid}`).once('value');
      const userData = userSnapshot.val();
      if (userData?.role !== 'admin') {
        return res.status(403).json(error('Unauthorized', 403));
      }
    }
    
    const notificationRef = db.ref(`notifications/${uid}`).push();
    await notificationRef.set({
      type: type || 'info',
      title: title,
      message: message,
      data: data,
      read: false,
      createdAt: Date.now(),
    });
    
    res.json(success({ notificationId: notificationRef.key }));
  } catch (err) {
    console.error('Send notification error:', err);
    res.status(500).json(error(err.message, 500));
  }
};