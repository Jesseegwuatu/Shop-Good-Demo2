const { db } = require('../_lib/firebase');
const { success, error, options } = require('../_lib/response');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json(error('Method not allowed', 405));
  
  try {
    const { q, limit = 20 } = req.query;
    
    if (!q || q.length < 2) {
      return res.status(400).json(error('Search query must be at least 2 characters', 400));
    }
    
    const snapshot = await db.ref('products').orderByChild('status').equalTo('active').once('value');
    const data = snapshot.val();
    
    if (!data) {
      return res.json(success({ products: [], count: 0 }));
    }
    
    const query = q.toLowerCase();
    const products = Object.values(data).filter(p => {
      const nameMatch = p.name?.toLowerCase().includes(query);
      const brandMatch = p.brand?.toLowerCase().includes(query);
      const descMatch = p.description?.toLowerCase().includes(query);
      return nameMatch || brandMatch || descMatch;
    });
    
    const paginated = products.slice(0, Number(limit));
    
    res.json(success({
      products: paginated,
      count: products.length,
      query: q,
    }));
  } catch (err) {
    console.error('Search products error:', err);
    res.status(500).json(error(err.message, 500));
  }
};