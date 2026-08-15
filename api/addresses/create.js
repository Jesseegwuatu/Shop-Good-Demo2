const { verifyToken } = require('../_lib/auth');
const { db } = require('../_lib/firebase');
const { success, error, options } = require('../_lib/response');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json(error('Method not allowed', 405));
  
  try {
    const user = await verifyToken(req);
    const addressData = req.body;
    
    const addressRef = db.ref(`addresses/${user.uid}`).push();
    const addressId = addressRef.key;
    
    const address = {
      ...addressData,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    
    await addressRef.set(address);
    
    // If this is default, unset others
    if (addressData.isDefault) {
      const snapshot = await db.ref(`addresses/${user.uid}`).once('value');
      const data = snapshot.val();
      if (data) {
        const updates = {};
        for (const [key] of Object.entries(data)) {
          if (key !== addressId) {
            updates[`${key}/isDefault`] = false;
          }
        }
        if (Object.keys(updates).length > 0) {
          await db.ref(`addresses/${user.uid}`).update(updates);
        }
      }
    }
    
    res.json(success({ addressId, address }));
  } catch (err) {
    console.error('Create address error:', err);
    res.status(500).json(error(err.message, 500));
  }
};