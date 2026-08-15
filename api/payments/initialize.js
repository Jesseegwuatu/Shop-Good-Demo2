// api/payments/initialize.js
import axios from 'axios';

// Paystack Configuration
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_PUBLIC_KEY = process.env.PAYSTACK_PUBLIC_KEY;
const PAYSTACK_API_URL = 'https://api.paystack.co';

// Firebase Database Configuration using SECRET
const DATABASE_URL = process.env.FIREBASE_DATABASE_URL;
const DATABASE_SECRET = process.env.FIREBASE_DATABASE_SECRET;

/**
 * Initialize Paystack Payment
 * POST /api/payments/initialize
 * 
 * Request Body:
 * {
 *   amount: number (in Naira),
 *   email: string (customer email),
 *   type: 'wallet_funding' | 'order_payment' | 'gift_card',
 *   metadata: {
 *     customerUid: string,
 *     orderId?: string,
 *     productId?: string,
 *     voucherCode?: string,
 *     recipient?: string
 *   }
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
    const { amount, email, type, metadata = {} } = req.body;

    // === VALIDATE ENVIRONMENT VARIABLES ===
    if (!PAYSTACK_SECRET_KEY) {
      console.error('❌ PAYSTACK_SECRET_KEY is not set');
      return res.status(500).json({
        success: false,
        message: 'Payment service configuration error.'
      });
    }

    if (!DATABASE_URL || !DATABASE_SECRET) {
      console.error('❌ Firebase database credentials are not set');
      return res.status(500).json({
        success: false,
        message: 'Database configuration error.'
      });
    }

    // === VALIDATION ===
    if (!amount || !email) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: amount and email are required.'
      });
    }

    if (amount < 100) {
      return res.status(400).json({
        success: false,
        message: 'Minimum funding amount is ₦100.'
      });
    }

    if (amount > 1000000) {
      return res.status(400).json({
        success: false,
        message: 'Maximum funding amount is ₦1,000,000 per transaction.'
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email address format.'
      });
    }

    const validTypes = ['wallet_funding', 'order_payment', 'gift_card'];
    if (type && !validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: `Invalid payment type. Must be one of: ${validTypes.join(', ')}`
      });
    }

    if (!metadata.customerUid) {
      return res.status(400).json({
        success: false,
        message: 'Customer UID is required in metadata.'
      });
    }

    // === GENERATE REFERENCE ===
    const reference = `SG${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    // === CREATE PAYSTACK TRANSACTION ===
    const amountInKobo = Math.round(amount * 100);

    const transactionData = {
      amount: amountInKobo,
      email: email,
      reference: reference,
      metadata: {
        ...metadata,
        paymentType: type || 'wallet_funding',
        custom_fields: [
          {
            display_name: 'Payment Type',
            variable_name: 'payment_type',
            value: type || 'wallet_funding'
          },
          {
            display_name: 'Customer UID',
            variable_name: 'customer_uid',
            value: metadata.customerUid
          }
        ]
      }
    };

    if (process.env.PAYSTACK_CALLBACK_URL) {
      transactionData.callback_url = process.env.PAYSTACK_CALLBACK_URL;
    }

    // === MAKE PAYSTACK API REQUEST ===
    const response = await axios.post(
      `${PAYSTACK_API_URL}/transaction/initialize`,
      transactionData,
      {
        headers: {
          'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        }
      }
    );

    // === HANDLE PAYSTACK RESPONSE ===
    if (response.data.status) {
      const { authorization_url, access_code, reference: ref } = response.data.data;

      // Store pending transaction in Firebase using REST API with secret
      const pendingTxData = {
        reference: ref,
        amount: amount,
        email: email,
        type: type || 'wallet_funding',
        customerUid: metadata.customerUid,
        orderId: metadata.orderId || null,
        metadata: metadata,
        status: 'pending',
        createdAt: Date.now(),
        expiresAt: Date.now() + (30 * 60 * 1000) // 30 minutes expiry
      };

      // Store using Firebase REST API
      const storeResponse = await fetch(
        `${DATABASE_URL}/pendingTransactions/${ref}.json?auth=${DATABASE_SECRET}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(pendingTxData)
        }
      );

      if (!storeResponse.ok) {
        console.error('Failed to store pending transaction:', await storeResponse.text());
        throw new Error('Failed to store transaction');
      }

      return res.status(200).json({
        success: true,
        message: 'Payment initialized successfully.',
        data: {
          authorization_url: authorization_url,
          reference: ref,
          access_code: access_code,
          public_key: PAYSTACK_PUBLIC_KEY
        }
      });
    } else {
      console.error('Paystack initialization error:', response.data.message);
      return res.status(400).json({
        success: false,
        message: response.data.message || 'Failed to initialize payment. Please try again.',
        paystack_response: response.data
      });
    }

  } catch (error) {
    console.error('Payment initialization error:', error);

    if (error.response) {
      return res.status(error.response.status || 500).json({
        success: false,
        message: error.response.data?.message || 'Payment service error. Please try again.',
        paystack_error: error.response.data
      });
    }

    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return res.status(504).json({
        success: false,
        message: 'Payment service timeout. Please try again.'
      });
    }

    return res.status(500).json({
      success: false,
      message: error.message || 'Internal server error. Please try again.'
    });
  }
}