const { verifyAdmin } = require('../_lib/auth');
const { db } = require('../_lib/firebase');
const { success, error, options } = require('../_lib/response');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json(error('Method not allowed', 405));
  
  try {
    await verifyAdmin(req);
    
    // Get total users
    const usersSnapshot = await db.ref('users').once('value');
    const users = usersSnapshot.val();
    const totalUsers = users ? Object.keys(users).length : 0;
    
    // Get total orders
    const ordersSnapshot = await db.ref('orders').once('value');
    const ordersData = ordersSnapshot.val();
    const orders = ordersData ? Object.values(ordersData) : [];
    const totalOrders = orders.length;
    const totalRevenue = orders.reduce((sum, o) => sum + (o.total || 0), 0);
    const pendingOrders = orders.filter(o => o.orderStatus === 'pending').length;
    
    // Get total products
    const productsSnapshot = await db.ref('products').once('value');
    const products = productsSnapshot.val();
    const totalProducts = products ? Object.keys(products).length : 0;
    
    // Get recent orders (last 10)
    const recentOrders = orders
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, 10);
    
    res.json(success({
      stats: {
        totalUsers,
        totalOrders,
        totalRevenue,
        pendingOrders,
        totalProducts,
      },
      recentOrders,
    }));
  } catch (err) {
    console.error('Dashboard error:', err);
    if (err.message === 'Admin access required') {
      return res.status(403).json(error(err.message, 403));
    }
    res.status(500).json(error(err.message, 500));
  }
};