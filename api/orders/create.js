// api/orders/create.js
import axios from 'axios';

// Firebase Database Configuration using SECRET
const DATABASE_URL = process.env.FIREBASE_DATABASE_URL;
const DATABASE_SECRET = process.env.FIREBASE_DATABASE_SECRET;

/**
 * Create Order
 * POST /api/orders/create
 * 
 * Request Body:
 * {
 *   customerUid: string,
 *   customerEmail: string,
 *   customerName: string,
 *   deliveryAddress: {
 *     fullName: string,
 *     phone: string,
 *     state: string,
 *     city: string,
 *     area: string,
 *     address: string,
 *     landmark: string,
 *     instructions: string
 *   },
 *   items: array,
 *   subtotal: number,
 *   deliveryFee: number,
 *   discount: number,
 *   total: number,
 *   paymentMethod: 'paystack' | 'wallet' | 'cod',
 *   paymentStatus: string,
 *   orderStatus: string,
 *   cartKeys: array
 * }
 */
export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed. Use POST.'
    });
  }

  try {
    const orderData = req.body;

    // === VALIDATE ENVIRONMENT VARIABLES ===
    if (!DATABASE_URL || !DATABASE_SECRET) {
      console.error('❌ Firebase database credentials are not set');
      return res.status(500).json({
        success: false,
        message: 'Database configuration error.'
      });
    }

    // === VALIDATE REQUIRED FIELDS ===
    const requiredFields = ['customerUid', 'customerEmail', 'deliveryAddress', 'items', 'total', 'paymentMethod'];
    for (const field of requiredFields) {
      if (!orderData[field]) {
        return res.status(400).json({
          success: false,
          message: `Missing required field: ${field}`
        });
      }
    }

    // Validate items
    if (!Array.isArray(orderData.items) || orderData.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one item is required.'
      });
    }

    // Validate delivery address
    const addressFields = ['fullName', 'phone', 'state', 'city', 'area', 'address'];
    for (const field of addressFields) {
      if (!orderData.deliveryAddress[field]) {
        return res.status(400).json({
          success: false,
          message: `Missing delivery address field: ${field}`
        });
      }
    }

    // Validate payment method
    const validPaymentMethods = ['paystack', 'wallet', 'cod'];
    if (!validPaymentMethods.includes(orderData.paymentMethod)) {
      return res.status(400).json({
        success: false,
        message: `Invalid payment method. Must be one of: ${validPaymentMethods.join(', ')}`
      });
    }

    // === GENERATE ORDER NUMBER ===
    const orderNumber = `SG${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 5).toUpperCase()}`;

    // === CREATE ORDER OBJECT ===
    const order = {
      id: null, // Will be set after push
      orderNumber: orderNumber,
      customerUid: orderData.customerUid,
      customerEmail: orderData.customerEmail,
      customerName: orderData.customerName || 'Customer',
      deliveryAddress: orderData.deliveryAddress,
      items: {},
      subtotal: orderData.subtotal || 0,
      deliveryFee: orderData.deliveryFee || 0,
      discount: orderData.discount || 0,
      total: orderData.total,
      paymentMethod: orderData.paymentMethod,
      paymentStatus: orderData.paymentStatus || 'pending',
      orderStatus: orderData.orderStatus || 'pending',
      statusHistory: {
        [Date.now()]: {
          status: 'pending',
          note: 'Order placed',
          updatedBy: 'system',
          timestamp: Date.now()
        }
      },
      timeline: {
        placed: Date.now()
      },
      estimatedDelivery: {
        start: Date.now() + (2 * 24 * 60 * 60 * 1000),
        end: Date.now() + (5 * 24 * 60 * 60 * 1000)
      },
      cartKeys: orderData.cartKeys || [],
      reviewed: false,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    // === ADD ITEMS TO ORDER ===
    orderData.items.forEach((item, index) => {
      order.items[`item_${index}`] = {
        productId: item.productId,
        name: item.name,
        thumbnail: item.thumbnail || '',
        quantity: item.quantity,
        price: item.price,
        total: item.quantity * item.price,
        variationName: item.variationName || ''
      };
    });

    // === STORE IN FIREBASE ===
    const orderRef = await fetch(
      `${DATABASE_URL}/orders.json?auth=${DATABASE_SECRET}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(order)
      }
    );

    if (!orderRef.ok) {
      throw new Error('Failed to create order');
    }

    const orderResult = await orderRef.json();
    const orderId = orderResult.name;

    // === UPDATE ORDER WITH ID ===
    await fetch(
      `${DATABASE_URL}/orders/${orderId}/id.json?auth=${DATABASE_SECRET}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderId)
      }
    );

    // === CLEAR CART ===
    if (orderData.cartKeys && orderData.cartKeys.length > 0) {
      // Clear each item from cart
      for (const cartKey of orderData.cartKeys) {
        await fetch(
          `${DATABASE_URL}/cart/${orderData.customerUid}/items/${cartKey}.json?auth=${DATABASE_SECRET}`,
          {
            method: 'DELETE'
          }
        );
      }
    }

    // === ADD NOTIFICATION FOR CUSTOMER ===
    const notifId = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
    await fetch(
      `${DATABASE_URL}/notifications/${orderData.customerUid}/${notifId}.json?auth=${DATABASE_SECRET}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'order',
          title: 'Order Placed! 📦',
          message: `Your order #${orderNumber} has been placed successfully.`,
          data: {
            orderId: orderId,
            orderNumber: orderNumber,
            total: orderData.total
          },
          read: false,
          createdAt: Date.now()
        })
      }
    );

    // === ADD NOTIFICATION FOR ADMIN ===
    await fetch(
      `${DATABASE_URL}/notifications/admin.json?auth=${DATABASE_SECRET}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'order',
          title: 'New Order! 🎉',
          message: `Order #${orderNumber} placed by ${orderData.customerName || 'Customer'}`,
          data: {
            orderId: orderId,
            orderNumber: orderNumber,
            customerUid: orderData.customerUid,
            total: orderData.total
          },
          read: false,
          createdAt: Date.now()
        })
      }
    );

    // === RETURN SUCCESS ===
    return res.status(200).json({
      success: true,
      message: 'Order created successfully.',
      data: {
        orderId: orderId,
        orderNumber: orderNumber,
        total: orderData.total,
        paymentMethod: orderData.paymentMethod,
        status: 'pending'
      }
    });

  } catch (error) {
    console.error('Create order error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to create order.'
    });
  }
}