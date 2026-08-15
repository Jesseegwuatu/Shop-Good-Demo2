const { verifyToken } = require('../_lib/auth');
const { db } = require('../_lib/firebase');
const { success, error, options } = require('../_lib/response');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'PUT') return res.status(405).json(error('Method not allowed', 405));
  
  try {
    const user = await verifyToken(req);
    const { id, ...updates } = req.body;
    
    if (!id) {
      return res.status(400).json(error('Address ID is required', 400));
    }
    
    const addressRef = db.ref(`addresses/${user.uid}/${id}`);
    const snapshot = await addressRef.once('value');
    
    if (!snapshot.exists()) {
      return res.status(404).json(error('Address not found', 404));
    }
    
    await addressRef.update({
      ...updates,
      updatedAt: Date.now(),
    });
    
    // If this is default, unset others
    if (updates.isDefault) {
      const allSnapshot = await db.ref(`addresses/${user.uid}`).once('value');
      const data = allSnapshot.val();
      if (data) {
        const unsetUpdates = {};
        for (const [key] of Object.entries(data)) {
          if (key !== id) {
            unsetUpdates[`${key}/isDefault`] = false;
          }
        }
        if (Object.keys(unsetUpdates).length > 0) {
          await db.ref(`addresses/${user.uid}`).update(unsetUpdates);
        }
      }
    }
    
    const updatedSnapshot = await addressRef.once('value');
    res.json(success({ address: updatedSnapshot.val() }));
  } catch (err) {
    console.error('Update address error:', err);
    res.status(500).json(error(err.message, 500));
  }
};