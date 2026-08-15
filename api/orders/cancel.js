// api/orders/cancel.js
const DATABASE_URL = process.env.FIREBASE_DATABASE_URL;
const DATABASE_SECRET = process.env.FIREBASE_DATABASE_SECRET;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed. Use POST.'
    });
  }

  try {
    const { orderId, reason, customerUid } = req.body;

    // === VALIDATE ===
    if (!DATABASE_URL || !DATABASE_SECRET) {
      console.error('❌ Firebase database credentials are not set');
      return res.status(500).json({
        success: false,
        message: 'Database configuration error.'
      });
    }

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: 'Order ID is required.'
      });
    }

    // === GET ORDER ===
    const orderResponse = await fetch(
      `${DATABASE_URL}/orders/${orderId}.json?auth=${DATABASE_SECRET}`
    );
    const order = await orderResponse.json();

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found.'
      });
    }

    // Check if order can be cancelled
    const cancellableStatuses = ['pending', 'paid', 'confirmed'];
    if (!cancellableStatuses.includes(order.orderStatus)) {
      return res.status(400).json({
        success: false,
        message: `Order cannot be cancelled. Current status: ${order.orderStatus}`
      });
    }

    // Verify ownership if customerUid provided
    if (customerUid && order.customerUid !== customerUid) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to cancel this order.'
      });
    }

    // === UPDATE ORDER STATUS ===
    const historyKey = Date.now();
    const updates = {
      orderStatus: 'cancelled',
      [`statusHistory/${historyKey}`]: {
        status: 'cancelled',
        note: reason || 'Order cancelled by customer',
        updatedBy: customerUid ? 'customer' : 'admin',
        timestamp: Date.now()
      },
      [`timeline/cancelled`]: Date.now()
    };

    // === APPLY UPDATES ===
    await fetch(
      `${DATABASE_URL}/orders/${orderId}.json?auth=${DATABASE_SECRET}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      }
    );

    // === RELEASE STOCK ===
    if (order.items) {
      for (const itemKey in order.items) {
        const item = order.items[itemKey];
        const productResponse = await fetch(
          `${DATABASE_URL}/products/${item.productId}.json?auth=${DATABASE_SECRET}`
        );
        const product = await productResponse.json();

        if (product && product.stock) {
          await fetch(
            `${DATABASE_URL}/products/${item.productId}/stock.json?auth=${DATABASE_SECRET}`,
            {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                available: (product.stock.available || 0) + item.quantity,
                reserved: Math.max(0, (product.stock.reserved || 0) - item.quantity)
              })
            }
          );
        }
      }
    }

    // === ADD NOTIFICATION ===
    const notifId = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
    await fetch(
      `${DATABASE_URL}/notifications/${order.customerUid}/${notifId}.json?auth=${DATABASE_SECRET}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'order',
          title: 'Order Cancelled ❌',
          message: `Your order #${order.orderNumber} has been cancelled.`,
          data: {
            orderId: orderId,
            orderNumber: order.orderNumber,
            reason: reason || 'Cancelled by customer'
          },
          read: false,
          createdAt: Date.now()
        })
      }
    );

    return res.status(200).json({
      success: true,
      message: 'Order cancelled successfully.',
      data: {
        orderId: orderId,
        orderNumber: order.orderNumber,
        status: 'cancelled'
      }
    });

  } catch (error) {
    console.error('Cancel order error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to cancel order.'
    });
  }
}