const { verifyAdmin } = require('../_lib/auth');
const { db, auth } = require('../_lib/firebase');
const { success, error, options } = require('../_lib/response');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(204).end();
  
  try {
    await verifyAdmin(req);
    
    if (req.method === 'POST') {
      // Add admin
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json(error('Email is required', 400));
      }
      
      let userRecord;
      try {
        userRecord = await auth.getUserByEmail(email);
      } catch (err) {
        if (err.code === 'auth/user-not-found') {
          return res.status(404).json(error('User not found', 404));
        }
        throw err;
      }
      
      await db.ref(`users/${userRecord.uid}/role`).set('admin');
      
      return res.json(success({ 
        uid: userRecord.uid,
        email: userRecord.email,
        role: 'admin',
      }));
    }
    
    if (req.method === 'DELETE') {
      // Remove admin
      const { uid } = req.query;
      
      if (!uid) {
        return res.status(400).json(error('User UID is required', 400));
      }
      
      // Don't allow removing yourself
      const adminUser = await verifyAdmin(req);
      if (uid === adminUser.uid) {
        return res.status(400).json(error('Cannot remove yourself as admin', 400));
      }
      
      await db.ref(`users/${uid}/role`).set('customer');
      
      return res.json(success({ removed: true }));
    }
    
    if (req.method === 'GET') {
      // List all admins
      const snapshot = await db.ref('users').orderByChild('role').equalTo('admin').once('value');
      const data = snapshot.val();
      
      const admins = data ? Object.values(data) : [];
      
      return res.json(success({ admins }));
    }
    
    return res.status(405).json(error('Method not allowed', 405));
  } catch (err) {
    console.error('Manage admins error:', err);
    if (err.message === 'Admin access required') {
      return res.status(403).json(error(err.message, 403));
    }
    res.status(500).json(error(err.message, 500));
  }
};