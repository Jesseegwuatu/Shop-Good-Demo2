const { verifyToken } = require('../_lib/auth');
const { db } = require('../_lib/firebase');
const { success, error, options } = require('../_lib/response');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'DELETE') return res.status(405).json(error('Method not allowed', 405));
  
  try {
    const user = await verifyToken(req);
    const { id } = req.query;
    
    if (!id) {
      return res.status(400).json(error('Address ID is required', 400));
    }
    
    const addressRef = db.ref(`addresses/${user.uid}/${id}`);
    const snapshot = await addressRef.once('value');
    
    if (!snapshot.exists()) {
      return res.status(404).json(error('Address not found', 404));
    }
    
    await addressRef.remove();
    
    res.json(success({ deleted: true }));
  } catch (err) {
    console.error('Delete address error:', err);
    res.status(500).json(error(err.message, 500));
  }
};