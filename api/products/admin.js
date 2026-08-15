const { verifyAdmin } = require('../_lib/auth');
const { db } = require('../_lib/firebase');
const { success, error, options } = require('../_lib/response');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(204).end();
  
  try {
    await verifyAdmin(req);
    
    if (req.method === 'POST') {
      // Create product
      const productData = req.body;
      const productRef = db.ref('products').push();
      const productId = productRef.key;
      
      const product = {
        ...productData,
        id: productId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        status: productData.status || 'active',
      };
      
      await productRef.set(product);
      
      return res.json(success({ productId, product }));
    }
    
    if (req.method === 'PUT') {
      // Update product
      const { id, ...updates } = req.body;
      
      if (!id) {
        return res.status(400).json(error('Product ID is required', 400));
      }
      
      const productRef = db.ref(`products/${id}`);
      const snapshot = await productRef.once('value');
      
      if (!snapshot.exists()) {
        return res.status(404).json(error('Product not found', 404));
      }
      
      await productRef.update({
        ...updates,
        updatedAt: Date.now(),
      });
      
      const updatedSnapshot = await productRef.once('value');
      
      return res.json(success({ product: updatedSnapshot.val() }));
    }
    
    if (req.method === 'DELETE') {
      // Delete product (soft delete)
      const { id } = req.query;
      
      if (!id) {
        return res.status(400).json(error('Product ID is required', 400));
      }
      
      await db.ref(`products/${id}/status`).set('inactive');
      await db.ref(`products/${id}/updatedAt`).set(Date.now());
      
      return res.json(success({ deleted: true }));
    }
    
    return res.status(405).json(error('Method not allowed', 405));
  } catch (err) {
    console.error('Product admin error:', err);
    if (err.message === 'Admin access required') {
      return res.status(403).json(error(err.message, 403));
    }
    res.status(500).json(error(err.message, 500));
  }
};