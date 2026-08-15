// api/orders/confirm.js
import axios from 'axios';

// Firebase Database Configuration using SECRET
const DATABASE_URL = process.env.FIREBASE_DATABASE_URL;
const DATABASE_SECRET = process.env.FIREBASE_DATABASE_SECRET;

/**
 * Confirm Order (After Payment)
 * POST /api/orders/confirm
 * 
 * Request Body:
 * {
 *   orderId: string,
 *   paymentReference: string,
 *   paymentMethod: 'paystack' | 'wallet' | 'cod'
 * }
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed. Use POST.'
    });
  }

  try {
    const { orderId, paymentReference, paymentMethod } = req.body;

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

    // === CHECK ORDER STATUS ===
    if (order.orderStatus !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Order is already ${order.orderStatus}. Cannot confirm.`
      });
    }

    // === UPDATE ORDER STATUS ===
    const updates = {
      paymentStatus: 'paid',
      orderStatus: 'confirmed',
      paymentDetails: {
        reference: paymentReference || 'COD',
        gateway: paymentMethod || 'cod',
        amount: order.total,
        paidAt: Date.now()
      }
    };

    // Add status history
    const historyKey = Date.now();
    updates[`statusHistory/${historyKey}`] = {
      status: 'confirmed',
      note: paymentMethod === 'cod' ? 'Order confirmed (Pay on Delivery)' : `Payment confirmed via ${paymentMethod}`,
      updatedBy: 'system',
      timestamp: Date.now()
    };

    // Update timeline
    updates[`timeline/paymentConfirmed`] = Date.now();
    updates[`timeline/confirmed`] = Date.now();

    // === APPLY UPDATES ===
    const updateResponse = await fetch(
      `${DATABASE_URL}/orders/${orderId}.json?auth=${DATABASE_SECRET}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      }
    );

    if (!updateResponse.ok) {
      throw new Error('Failed to update order');
    }

    // === RESERVE STOCK ===
    if (order.items) {
      for (const itemKey in order.items) {
        const item = order.items[itemKey];
        const productResponse = await fetch(
          `${DATABASE_URL}/products/${item.productId}.json?auth=${DATABASE_SECRET}`
        );
        const product = await productResponse.json();

        if (product && product.stock) {
          const newStock = (product.stock.available || 0) - item.quantity;
          await fetch(
            `${DATABASE_URL}/products/${item.productId}/stock.json?auth=${DATABASE_SECRET}`,
            {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                available: Math.max(0, newStock),
                reserved: (product.stock.reserved || 0) + item.quantity
              })
            }
          );
        }
      }
    }

    // === ADD NOTIFICATION FOR CUSTOMER ===
    const notifId = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
    await fetch(
      `${DATABASE_URL}/notifications/${order.customerUid}/${notifId}.json?auth=${DATABASE_SECRET}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'order',
          title: 'Order Confirmed! ✅',
          message: `Your order #${order.orderNumber} has been confirmed. We'll process it soon.`,
          data: {
            orderId: orderId,
            orderNumber: order.orderNumber
          },
          read: false,
          createdAt: Date.now()
        })
      }
    );

    // === RETURN SUCCESS ===
    return res.status(200).json({
      success: true,
      message: 'Order confirmed successfully.',
      data: {
        orderId: orderId,
        orderNumber: order.orderNumber,
        status: 'confirmed'
      }
    });

  } catch (error) {
    console.error('Confirm order error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to confirm order.'
    });
  }
}