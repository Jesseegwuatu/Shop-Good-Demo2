// api/payments/verify.js
import axios from 'axios';

// Paystack Configuration
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_API_URL = 'https://api.paystack.co';

// Firebase Database Configuration using SECRET
const DATABASE_URL = process.env.FIREBASE_DATABASE_URL;
const DATABASE_SECRET = process.env.FIREBASE_DATABASE_SECRET;

/**
 * Verify Paystack Payment
 * GET /api/payments/verify?reference=SGXXXXXXXXX
 */
export default async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed. Use GET.'
    });
  }

  try {
    const { reference } = req.query;

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

    // === VALIDATE REFERENCE ===
    if (!reference) {
      return res.status(400).json({
        success: false,
        message: 'Transaction reference is required.'
      });
    }

    if (!reference.startsWith('SG')) {
      return res.status(400).json({
        success: false,
        message: 'Invalid transaction reference format.'
      });
    }

    // === CHECK PENDING TRANSACTION ===
    // Using the REST API with auth secret
    const pendingTxResponse = await fetch(
      `${DATABASE_URL}/pendingTransactions/${reference}.json?auth=${DATABASE_SECRET}`
    );
    
    if (!pendingTxResponse.ok) {
      throw new Error('Failed to fetch pending transaction');
    }
    
    const pendingTx = await pendingTxResponse.json();

    if (!pendingTx) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found or already processed.'
      });
    }

    // === CHECK EXPIRY ===
    if (pendingTx.expiresAt && pendingTx.expiresAt < Date.now()) {
      // Update status to expired using REST API
      await fetch(
        `${DATABASE_URL}/pendingTransactions/${reference}/status.json?auth=${DATABASE_SECRET}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify('expired')
        }
      );
      
      return res.status(400).json({
        success: false,
        message: 'Transaction has expired. Please initiate a new payment.'
      });
    }

    // === VERIFY WITH PAYSTACK ===
    try {
      const response = await axios.get(
        `${PAYSTACK_API_URL}/transaction/verify/${reference}`,
        {
          headers: {
            'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
            'Content-Type': 'application/json',
          }
        }
      );

      const paystackData = response.data;

      if (!paystackData.status) {
        // Update pending transaction status
        await fetch(
          `${DATABASE_URL}/pendingTransactions/${reference}.json?auth=${DATABASE_SECRET}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              status: 'failed',
              verifiedAt: Date.now()
            })
          }
        );

        return res.status(400).json({
          success: false,
          message: paystackData.message || 'Payment verification failed.',
          paystack_response: paystackData
        });
      }

      const transaction = paystackData.data;

      if (transaction.status === 'success') {
        // Payment successful - process the transaction
        const result = await processSuccessfulPayment(reference, pendingTx, transaction);

        return res.status(200).json({
          success: true,
          message: 'Payment verified successfully.',
          data: result
        });

      } else if (transaction.status === 'failed') {
        await fetch(
          `${DATABASE_URL}/pendingTransactions/${reference}.json?auth=${DATABASE_SECRET}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              status: 'failed',
              verifiedAt: Date.now()
            })
          }
        );

        return res.status(400).json({
          success: false,
          message: 'Payment failed. Please try again.',
          data: {
            reference: reference,
            status: 'failed'
          }
        });

      } else if (transaction.status === 'abandoned') {
        await fetch(
          `${DATABASE_URL}/pendingTransactions/${reference}.json?auth=${DATABASE_SECRET}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              status: 'abandoned',
              verifiedAt: Date.now()
            })
          }
        );

        return res.status(400).json({
          success: false,
          message: 'Payment was abandoned. Please try again.',
          data: {
            reference: reference,
            status: 'abandoned'
          }
        });

      } else {
        return res.status(202).json({
          success: false,
          message: `Payment status: ${transaction.status}. Please wait.`,
          data: {
            reference: reference,
            status: transaction.status
          }
        });
      }

    } catch (paystackError) {
      console.error('Paystack verification error:', paystackError);

      if (paystackError.response) {
        return res.status(paystackError.response.status || 500).json({
          success: false,
          message: paystackError.response.data?.message || 'Payment verification service error.',
          paystack_error: paystackError.response.data
        });
      }

      throw paystackError;
    }

  } catch (error) {
    console.error('Payment verification error:', error);

    return res.status(500).json({
      success: false,
      message: error.message || 'Internal server error. Please try again.'
    });
  }
}

// ========================================
// PROCESS SUCCESSFUL PAYMENT
// ========================================
async function processSuccessfulPayment(reference, pendingTx, paystackTransaction) {
  const { 
    customerUid, 
    type, 
    orderId, 
    metadata, 
    amount 
  } = pendingTx;

  const updates = {};
  const responseData = {
    reference: reference,
    amount: amount,
    status: 'success',
    paymentType: type,
    customerUid: customerUid,
    paidAt: Date.now()
  };

  // Update pending transaction
  updates[`pendingTransactions/${reference}`] = {
    ...pendingTx,
    status: 'completed',
    verifiedAt: Date.now()
  };

  // === HANDLE DIFFERENT PAYMENT TYPES ===

  // 1. Wallet Funding
  if (type === 'wallet_funding') {
    // Get current balance
    const balanceResponse = await fetch(
      `${DATABASE_URL}/wallets/${customerUid}/balance.json?auth=${DATABASE_SECRET}`
    );
    const currentBalance = await balanceResponse.json() || 0;
    const newBalance = currentBalance + amount;

    updates[`wallets/${customerUid}/balance`] = newBalance;

    // Add transaction record
    const txId = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
    updates[`walletTransactions/${txId}`] = {
      customerUid: customerUid,
      type: 'fund',
      amount: amount,
      balanceBefore: currentBalance,
      balanceAfter: newBalance,
      reference: reference,
      status: 'completed',
      method: 'paystack',
      description: `Wallet funding via Paystack (${reference})`,
      createdAt: Date.now()
    };

    // Add notification
    const notifId = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
    updates[`notifications/${customerUid}/${notifId}`] = {
      type: 'wallet',
      title: 'Wallet Funded! 💰',
      message: `₦${Number(amount).toLocaleString()} has been added to your wallet.`,
      data: {
        amount: amount,
        reference: reference,
        newBalance: newBalance
      },
      read: false,
      createdAt: Date.now()
    };

    responseData.wallet = {
      previousBalance: currentBalance,
      newBalance: newBalance,
      fundedAmount: amount
    };
  }

  // 2. Order Payment
  else if (type === 'order_payment' && orderId) {
    // Get order details
    const orderResponse = await fetch(
      `${DATABASE_URL}/orders/${orderId}.json?auth=${DATABASE_SECRET}`
    );
    const order = await orderResponse.json();

    updates[`orders/${orderId}/paymentStatus`] = 'paid';
    updates[`orders/${orderId}/paymentDetails`] = {
      reference: reference,
      gateway: 'paystack',
      amount: amount,
      paidAt: Date.now()
    };
    updates[`orders/${orderId}/orderStatus`] = 'paid';

    // Add notification for customer
    const notifId = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
    updates[`notifications/${customerUid}/${notifId}`] = {
      type: 'order',
      title: 'Order Paid! ✅',
      message: `Your order #${order?.orderNumber || orderId.slice(-8)} has been paid. We'll start processing it soon.`,
      data: {
        orderId: orderId,
        amount: amount,
        reference: reference
      },
      read: false,
      createdAt: Date.now()
    };

    responseData.orderId = orderId;
  }

  // 3. Gift Card Purchase
  else if (type === 'gift_card') {
    const giftCardData = metadata || {};
    const giftCode = `GC${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    const giftId = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
    updates[`vouchers/${giftId}`] = {
      id: giftId,
      code: giftCode,
      type: 'gift_card',
      discountType: 'fixed',
      value: amount,
      customerUid: customerUid,
      customerEmail: giftCardData.recipientEmail || pendingTx.email,
      recipientEmail: giftCardData.recipientEmail || pendingTx.email,
      recipientMessage: giftCardData.recipientMessage || '',
      senderName: giftCardData.senderName || 'Shop Good',
      status: 'active',
      isGift: true,
      paymentReference: reference,
      expiryDate: Date.now() + (365 * 24 * 60 * 60 * 1000),
      createdAt: Date.now()
    };

    // Add notification for sender
    const notifId = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
    updates[`notifications/${customerUid}/${notifId}`] = {
      type: 'promotion',
      title: 'Gift Card Purchased! 🎁',
      message: `You've purchased a gift card worth ₦${Number(amount).toLocaleString()} for ${giftCardData.recipientEmail || 'a friend'}.`,
      data: {
        giftCode: giftCode,
        amount: amount,
        recipient: giftCardData.recipientEmail || ''
      },
      read: false,
      createdAt: Date.now()
    };

    responseData.giftCard = {
      code: giftCode,
      recipientEmail: giftCardData.recipientEmail || pendingTx.email,
      amount: amount
    };
  }

  // === APPLY ALL UPDATES ===
  // Send all updates in one batch using PATCH
  const updateResponse = await fetch(
    `${DATABASE_URL}/.json?auth=${DATABASE_SECRET}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    }
  );

  if (!updateResponse.ok) {
    throw new Error('Failed to update database');
  }

  return responseData;
}