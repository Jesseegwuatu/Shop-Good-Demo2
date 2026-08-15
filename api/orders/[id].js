// api/orders/[id].js
const DATABASE_URL = process.env.FIREBASE_DATABASE_URL;
const DATABASE_SECRET = process.env.FIREBASE_DATABASE_SECRET;

/**
 * Get Order by ID
 * GET /api/orders/[id]?uid=USER_UID
 * 
 * Query Parameters:
 * - uid: string (required) - User UID to verify ownership
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed. Use GET.'
    });
  }

  try {
    const { id } = req.query;
    const { uid } = req.query;

    // === VALIDATE ===
    if (!DATABASE_URL || !DATABASE_SECRET) {
      console.error('❌ Firebase database credentials are not set');
      return res.status(500).json({
        success: false,
        message: 'Database configuration error.'
      });
    }

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Order ID is required.'
      });
    }

    // === GET ORDER ===
    const orderResponse = await fetch(
      `${DATABASE_URL}/orders/${id}.json?auth=${DATABASE_SECRET}`
    );

    if (!orderResponse.ok) {
      throw new Error('Failed to fetch order');
    }

    const order = await orderResponse.json();

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found.'
      });
    }

    // === CHECK OWNERSHIP (if uid provided) ===
    if (uid && order.customerUid !== uid) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to view this order.'
      });
    }

    // === GET CATEGORY NAMES FOR ITEMS ===
    const categoriesResponse = await fetch(
      `${DATABASE_URL}/categories.json?auth=${DATABASE_SECRET}`
    );
    const categories = await categoriesResponse.json() || {};

    // === ENRICH ORDER ITEMS ===
    const enrichedOrder = {
      ...order,
      items: Object.entries(order.items || {}).reduce((acc, [key, item]) => {
        const category = categories[item.categoryId];
        acc[key] = {
          ...item,
          categoryName: category?.name || null
        };
        return acc;
      }, {})
    };

    // === GET PRODUCT DETAILS FOR ITEMS ===
    const productIds = Object.values(order.items || {}).map(item => item.productId);
    const products = {};
    for (const productId of productIds) {
      const productResponse = await fetch(
        `${DATABASE_URL}/products/${productId}.json?auth=${DATABASE_SECRET}`
      );
      if (productResponse.ok) {
        const product = await productResponse.json();
        if (product) {
          products[productId] = product;
        }
      }
    }

    // === ENRICH WITH PRODUCT DETAILS ===
    const finalOrder = {
      ...enrichedOrder,
      items: Object.entries(order.items || {}).reduce((acc, [key, item]) => {
        const product = products[item.productId];
        acc[key] = {
          ...item,
          productDetails: product || null
        };
        return acc;
      }, {})
    };

    return res.status(200).json({
      success: true,
      data: finalOrder
    });

  } catch (error) {
    console.error('Get order error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to get order.'
    });
  }
}