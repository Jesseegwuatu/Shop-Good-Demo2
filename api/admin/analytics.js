const { verifyAdmin } = require('../_lib/auth');
const { db } = require('../_lib/firebase');
const { success, error, options } = require('../_lib/response');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json(error('Method not allowed', 405));
  
  try {
    await verifyAdmin(req);
    const { period = '30' } = req.query;
    const days = parseInt(period);
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
    
    // Get all orders
    const ordersSnapshot = await db.ref('orders').once('value');
    const ordersData = ordersSnapshot.val();
    const orders = ordersData ? Object.values(ordersData) : [];
    
    // Filter by period
    const periodOrders = orders.filter(o => (o.createdAt || 0) >= cutoff);
    
    // Group by date
    const dailyRevenue = {};
    const dailyOrders = {};
    periodOrders.forEach(o => {
      const date = o.createdAt ? new Date(o.createdAt).toLocaleDateString() : 'unknown';
      dailyRevenue[date] = (dailyRevenue[date] || 0) + (o.total || 0);
      dailyOrders[date] = (dailyOrders[date] || 0) + 1;
    });
    
    // Category breakdown
    const categorySales = {};
    periodOrders.forEach(o => {
      if (o.items) {
        Object.values(o.items).forEach(item => {
          const cat = item.categoryName || 'Uncategorized';
          categorySales[cat] = (categorySales[cat] || 0) + (item.total || (item.price * item.quantity || 0));
        });
      }
    });
    
    // Status distribution
    const statusCounts = {};
    periodOrders.forEach(o => {
      const status = o.orderStatus || 'unknown';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });
    
    res.json(success({
      period: days,
      totalOrders: periodOrders.length,
      totalRevenue: periodOrders.reduce((sum, o) => sum + (o.total || 0), 0),
      dailyRevenue: Object.entries(dailyRevenue).map(([date, amount]) => ({ date, amount })),
      dailyOrders: Object.entries(dailyOrders).map(([date, count]) => ({ date, count })),
      categorySales: Object.entries(categorySales)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([category, amount]) => ({ category, amount })),
      statusDistribution: statusCounts,
    }));
  } catch (err) {
    console.error('Analytics error:', err);
    if (err.message === 'Admin access required') {
      return res.status(403).json(error(err.message, 403));
    }
    res.status(500).json(error(err.message, 500));
  }
};