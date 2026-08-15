const { db } = require('../_lib/firebase');
const { success, error, options } = require('../_lib/response');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json(error('Method not allowed', 405));
  
  try {
    const { id } = req.query;
    
    if (!id) {
      return res.status(400).json(error('Product ID is required', 400));
    }
    
    const snapshot = await db.ref(`products/${id}`).once('value');
    const product = snapshot.val();
    
    if (!product) {
      return res.status(404).json(error('Product not found', 404));
    }
    
    res.json(success({ product }));
  } catch (err) {
    console.error('Get product error:', err);
    res.status(500).json(error(err.message, 500));
  }
};