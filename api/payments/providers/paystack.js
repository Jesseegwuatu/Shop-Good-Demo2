// api/payments/providers/paystack.js
import axios from 'axios';

/**
 * Paystack Payment Provider
 * Handles all Paystack payment operations
 */

// Paystack Configuration
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_PUBLIC_KEY = process.env.PAYSTACK_PUBLIC_KEY;
const PAYSTACK_API_URL = 'https://api.paystack.co';

// Firebase Database Configuration
const DATABASE_URL = process.env.FIREBASE_DATABASE_URL;
const DATABASE_SECRET = process.env.FIREBASE_DATABASE_SECRET;

/**
 * Initialize Paystack Transaction
 */
export async function initializeTransaction(amount, email, reference, metadata = {}) {
  try {
    const amountInKobo = Math.round(amount * 100);

    const response = await axios.post(
      `${PAYSTACK_API_URL}/transaction/initialize`,
      {
        amount: amountInKobo,
        email: email,
        reference: reference,
        metadata: {
          ...metadata,
          custom_fields: [
            {
              display_name: 'Payment Type',
              variable_name: 'payment_type',
              value: metadata.type || 'wallet_funding'
            },
            {
              display_name: 'Customer UID',
              variable_name: 'customer_uid',
              value: metadata.customerUid
            }
          ]
        },
        callback_url: process.env.PAYSTACK_CALLBACK_URL || null
      },
      {
        headers: {
          'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        }
      }
    );

    if (response.data.status) {
      return {
        success: true,
        data: {
          authorization_url: response.data.data.authorization_url,
          reference: response.data.data.reference,
          access_code: response.data.data.access_code
        }
      };
    } else {
      return {
        success: false,
        message: response.data.message || 'Failed to initialize payment'
      };
    }

  } catch (error) {
    console.error('Paystack initialization error:', error);
    return {
      success: false,
      message: error.response?.data?.message || error.message || 'Payment initialization failed'
    };
  }
}

/**
 * Verify Paystack Transaction
 */
export async function verifyTransaction(reference) {
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

    if (response.data.status) {
      return {
        success: true,
        data: response.data.data,
        status: response.data.data.status
      };
    } else {
      return {
        success: false,
        message: response.data.message || 'Verification failed',
        data: response.data
      };
    }

  } catch (error) {
    console.error('Paystack verification error:', error);
    return {
      success: false,
      message: error.response?.data?.message || error.message || 'Verification failed'
    };
  }
}

/**
 * Get Transaction Details
 */
export async function getTransaction(reference) {
  try {
    const response = await axios.get(
      `${PAYSTACK_API_URL}/transaction/${reference}`,
      {
        headers: {
          'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        }
      }
    );

    if (response.data.status) {
      return {
        success: true,
        data: response.data.data
      };
    } else {
      return {
        success: false,
        message: response.data.message || 'Transaction not found'
      };
    }

  } catch (error) {
    console.error('Get transaction error:', error);
    return {
      success: false,
      message: error.response?.data?.message || error.message || 'Failed to get transaction'
    };
  }
}

/**
 * Get Transaction by Reference
 */
export async function getTransactionByReference(reference) {
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

    if (response.data.status) {
      return {
        success: true,
        data: response.data.data
      };
    } else {
      return {
        success: false,
        message: response.data.message || 'Transaction not found'
      };
    }

  } catch (error) {
    console.error('Get transaction by reference error:', error);
    return {
      success: false,
      message: error.response?.data?.message || error.message || 'Failed to get transaction'
    };
  }
}

/**
 * Refund Transaction
 */
export async function refundTransaction(reference, amount) {
  try {
    const response = await axios.post(
      `${PAYSTACK_API_URL}/refund`,
      {
        transaction: reference,
        amount: amount ? Math.round(amount * 100) : undefined
      },
      {
        headers: {
          'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        }
      }
    );

    if (response.data.status) {
      return {
        success: true,
        data: response.data.data
      };
    } else {
      return {
        success: false,
        message: response.data.message || 'Refund failed'
      };
    }

  } catch (error) {
    console.error('Refund error:', error);
    return {
      success: false,
      message: error.response?.data?.message || error.message || 'Refund failed'
    };
  }
}

/**
 * Get Bank List
 */
export async function getBankList() {
  try {
    const response = await axios.get(
      `${PAYSTACK_API_URL}/bank`,
      {
        headers: {
          'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        }
      }
    );

    if (response.data.status) {
      return {
        success: true,
        data: response.data.data
      };
    } else {
      return {
        success: false,
        message: response.data.message || 'Failed to get banks'
      };
    }

  } catch (error) {
    console.error('Get banks error:', error);
    return {
      success: false,
      message: error.response?.data?.message || error.message || 'Failed to get banks'
    };
  }
}

/**
 * Verify Account Number
 */
export async function verifyAccountNumber(accountNumber, bankCode) {
  try {
    const response = await axios.get(
      `${PAYSTACK_API_URL}/bank/resolve`,
      {
        params: {
          account_number: accountNumber,
          bank_code: bankCode
        },
        headers: {
          'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        }
      }
    );

    if (response.data.status) {
      return {
        success: true,
        data: response.data.data
      };
    } else {
      return {
        success: false,
        message: response.data.message || 'Account verification failed'
      };
    }

  } catch (error) {
    console.error('Account verification error:', error);
    return {
      success: false,
      message: error.response?.data?.message || error.message || 'Account verification failed'
    };
  }
}

/**
 * Initiate Transfer
 */
export async function initiateTransfer(amount, recipient, reason = 'Wallet withdrawal') {
  try {
    const response = await axios.post(
      `${PAYSTACK_API_URL}/transfer`,
      {
        source: 'balance',
        amount: Math.round(amount * 100),
        recipient: recipient,
        reason: reason
      },
      {
        headers: {
          'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        }
      }
    );

    if (response.data.status) {
      return {
        success: true,
        data: response.data.data
      };
    } else {
      return {
        success: false,
        message: response.data.message || 'Transfer failed'
      };
    }

  } catch (error) {
    console.error('Transfer error:', error);
    return {
      success: false,
      message: error.response?.data?.message || error.message || 'Transfer failed'
    };
  }
}

/**
 * Create Transfer Recipient
 */
export async function createTransferRecipient(name, accountNumber, bankCode) {
  try {
    const response = await axios.post(
      `${PAYSTACK_API_URL}/transferrecipient`,
      {
        type: 'nuban',
        name: name,
        account_number: accountNumber,
        bank_code: bankCode,
        currency: 'NGN'
      },
      {
        headers: {
          'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        }
      }
    );

    if (response.data.status) {
      return {
        success: true,
        data: response.data.data
      };
    } else {
      return {
        success: false,
        message: response.data.message || 'Failed to create recipient'
      };
    }

  } catch (error) {
    console.error('Create recipient error:', error);
    return {
      success: false,
      message: error.response?.data?.message || error.message || 'Failed to create recipient'
    };
  }
}

/**
 * Check Transaction Status
 */
export async function checkTransactionStatus(reference) {
  const result = await verifyTransaction(reference);
  return result;
}

/**
 * Handle Webhook Event
 */
export async function handleWebhookEvent(payload) {
  const event = payload?.event;
  const data = payload?.data;

  if (!event || !data) {
    return { success: false, message: 'Invalid webhook payload' };
  }

  const reference = data?.reference;

  switch (event) {
    case 'charge.success':
      return await handleChargeSuccess(data);
    case 'charge.failed':
      return await handleChargeFailed(data);
    case 'charge.pending':
      return await handleChargePending(data);
    default:
      return { success: true, message: 'Event handled', event };
  }
}

// ========================================
// WEBHOOK EVENT HANDLERS
// ========================================

async function handleChargeSuccess(data) {
  const reference = data?.reference;
  const amount = data?.amount ? data.amount / 100 : 0;
  const customerEmail = data?.customer?.email;
  const metadata = data?.metadata || {};

  console.log(`✅ Charge successful: ${reference} - ₦${amount}`);

  // Get pending transaction
  const pendingTxResponse = await fetch(
    `${DATABASE_URL}/pendingTransactions/${reference}.json?auth=${DATABASE_SECRET}`
  );
  const pendingTx = await pendingTxResponse.json();

  if (!pendingTx) {
    console.log(`⚠️ No pending transaction found for: ${reference}`);
    return { success: false, message: 'Pending transaction not found' };
  }

  const { customerUid, type, orderId } = pendingTx;

  // === WALLET FUNDING ===
  if (type === 'wallet_funding') {
    const balanceResponse = await fetch(
      `${DATABASE_URL}/wallets/${customerUid}/balance.json?auth=${DATABASE_SECRET}`
    );
    const currentBalance = await balanceResponse.json() || 0;
    const newBalance = currentBalance + amount;

    await fetch(
      `${DATABASE_URL}/wallets/${customerUid}/balance.json?auth=${DATABASE_SECRET}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newBalance)
      }
    );

    const txId = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
    await fetch(
      `${DATABASE_URL}/walletTransactions/${txId}.json?auth=${DATABASE_SECRET}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
        })
      }
    );

    const notifId = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
    await fetch(
      `${DATABASE_URL}/notifications/${customerUid}/${notifId}.json?auth=${DATABASE_SECRET}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'wallet',
          title: 'Wallet Funded! 💰',
          message: `₦${Number(amount).toLocaleString()} has been added to your wallet.`,
          data: { amount, reference, newBalance },
          read: false,
          createdAt: Date.now()
        })
      }
    );
  }

  // === ORDER PAYMENT ===
  else if (type === 'order_payment' && orderId) {
    await fetch(
      `${DATABASE_URL}/orders/${orderId}/paymentStatus.json?auth=${DATABASE_SECRET}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify('paid')
      }
    );

    await fetch(
      `${DATABASE_URL}/orders/${orderId}/orderStatus.json?auth=${DATABASE_SECRET}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify('paid')
      }
    );

    const orderResponse = await fetch(
      `${DATABASE_URL}/orders/${orderId}.json?auth=${DATABASE_SECRET}`
    );
    const order = await orderResponse.json();

    const notifId = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
    await fetch(
      `${DATABASE_URL}/notifications/${customerUid}/${notifId}.json?auth=${DATABASE_SECRET}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'order',
          title: 'Order Paid! ✅',
          message: `Your order #${order?.orderNumber || orderId.slice(-8)} has been paid via Paystack.`,
          data: { orderId, amount, reference },
          read: false,
          createdAt: Date.now()
        })
      }
    );
  }

  // Update pending transaction
  await fetch(
    `${DATABASE_URL}/pendingTransactions/${reference}.json?auth=${DATABASE_SECRET}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'completed',
        verifiedAt: Date.now()
      })
    }
  );

  return { success: true, message: 'Charge success handled' };
}

async function handleChargeFailed(data) {
  const reference = data?.reference;
  console.log(`❌ Charge failed: ${reference}`);

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

  return { success: true, message: 'Charge failed handled' };
}

async function handleChargePending(data) {
  const reference = data?.reference;
  console.log(`⏳ Charge pending: ${reference}`);

  await fetch(
    `${DATABASE_URL}/pendingTransactions/${reference}.json?auth=${DATABASE_SECRET}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'pending',
        verifiedAt: Date.now()
      })
    }
  );

  return { success: true, message: 'Charge pending handled' };
}

/**
 * Export all functions
 */
export default {
  initializeTransaction,
  verifyTransaction,
  getTransaction,
  getTransactionByReference,
  refundTransaction,
  getBankList,
  verifyAccountNumber,
  initiateTransfer,
  createTransferRecipient,
  checkTransactionStatus,
  handleWebhookEvent
};