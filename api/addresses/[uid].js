const { verifyToken } = require('../_lib/auth');
const { db } = require('../_lib/firebase');
const { success, error, options } = require('../_lib/response');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json(error('Method not allowed', 405));
  
  try {
    const user = await verifyToken(req);
    const { uid } = req.query;
    
    if (uid !== user.uid) {
      return res.status(403).json(error('Unauthorized', 403));
    }
    
    const snapshot = await db.ref(`addresses/${uid}`).once('value');
    const data = snapshot.val();
    
    const addresses = data ? Object.entries(data).map(([key, value]) => ({
      ...value,
      id: key,
    })) : [];
    
    res.json(success({ addresses }));
  } catch (err) {
    console.error('Get addresses error:', err);
    res.status(500).json(error(err.message, 500));
  }
};