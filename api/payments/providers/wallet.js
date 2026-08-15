// api/payments/providers/wallet.js
const DATABASE_URL = process.env.FIREBASE_DATABASE_URL;
const DATABASE_SECRET = process.env.FIREBASE_DATABASE_SECRET;

/**
 * Wallet Payment Provider
 * Handles all wallet payment operations
 */

/**
 * Get Wallet Balance
 */
export async function getBalance(uid) {
  try {
    if (!DATABASE_URL || !DATABASE_SECRET) {
      console.error('❌ Firebase database credentials are not set');
      return { success: false, message: 'Database configuration error' };
    }

    const response = await fetch(
      `${DATABASE_URL}/wallets/${uid}/balance.json?auth=${DATABASE_SECRET}`
    );

    if (!response.ok) {
      throw new Error('Failed to fetch balance');
    }

    const balance = await response.json() || 0;

    return {
      success: true,
      data: {
        balance: balance,
        formatted: `₦${Number(balance).toLocaleString()}`
      }
    };

  } catch (error) {
    console.error('Get balance error:', error);
    return {
      success: false,
      message: error.message || 'Failed to get balance'
    };
  }
}

/**
 * Fund Wallet (Internal)
 */
export async function fundWallet(uid, amount, reference, method = 'paystack', metadata = {}) {
  try {
    if (!DATABASE_URL || !DATABASE_SECRET) {
      console.error('❌ Firebase database credentials are not set');
      return { success: false, message: 'Database configuration error' };
    }

    if (!uid || !amount || amount <= 0) {
      return { success: false, message: 'Invalid amount or user' };
    }

    // Get current balance
    const balanceResponse = await fetch(
      `${DATABASE_URL}/wallets/${uid}/balance.json?auth=${DATABASE_SECRET}`
    );
    const currentBalance = await balanceResponse.json() || 0;
    const newBalance = currentBalance + amount;

    // Update balance
    await fetch(
      `${DATABASE_URL}/wallets/${uid}/balance.json?auth=${DATABASE_SECRET}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newBalance)
      }
    );

    // Add transaction record
    const txId = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
    await fetch(
      `${DATABASE_URL}/walletTransactions/${txId}.json?auth=${DATABASE_SECRET}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerUid: uid,
          type: 'fund',
          amount: amount,
          balanceBefore: currentBalance,
          balanceAfter: newBalance,
          reference: reference || `FUND-${Date.now()}`,
          status: 'completed',
          method: method || 'internal',
          metadata: metadata,
          description: metadata.description || `Wallet funding via ${method}`,
          createdAt: Date.now()
        })
      }
    );

    // Add notification
    const notifId = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
    await fetch(
      `${DATABASE_URL}/notifications/${uid}/${notifId}.json?auth=${DATABASE_SECRET}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
        })
      }
    );

    return {
      success: true,
      data: {
        previousBalance: currentBalance,
        newBalance: newBalance,
        fundedAmount: amount,
        reference: reference
      }
    };

  } catch (error) {
    console.error('Fund wallet error:', error);
    return {
      success: false,
      message: error.message || 'Failed to fund wallet'
    };
  }
}

/**
 * Process Wallet Payment
 */
export async function processPayment(uid, amount, orderId, reference) {
  try {
    if (!DATABASE_URL || !DATABASE_SECRET) {
      console.error('❌ Firebase database credentials are not set');
      return { success: false, message: 'Database configuration error' };
    }

    if (!uid || !amount || !orderId) {
      return { success: false, message: 'Missing required fields' };
    }

    if (amount <= 0) {
      return { success: false, message: 'Amount must be greater than 0' };
    }

    // Get wallet balance
    const balanceResponse = await fetch(
      `${DATABASE_URL}/wallets/${uid}/balance.json?auth=${DATABASE_SECRET}`
    );
    const currentBalance = await balanceResponse.json() || 0;

    // Check sufficient balance
    if (currentBalance < amount) {
      return {
        success: false,
        message: 'Insufficient wallet balance',
        data: {
          currentBalance: currentBalance,
          required: amount,
          shortfall: amount - currentBalance
        }
      };
    }

    const newBalance = currentBalance - amount;

    // Deduct from wallet
    await fetch(
      `${DATABASE_URL}/wallets/${uid}/balance.json?auth=${DATABASE_SECRET}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newBalance)
      }
    );

    // Add transaction record
    const txId = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
    await fetch(
      `${DATABASE_URL}/walletTransactions/${txId}.json?auth=${DATABASE_SECRET}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerUid: uid,
          type: 'payment',
          amount: amount,
          balanceBefore: currentBalance,
          balanceAfter: newBalance,
          reference: reference || `PAY-${Date.now()}`,
          status: 'completed',
          method: 'wallet',
          description: `Order payment #${orderId.slice(-8)}`,
          metadata: { orderId: orderId },
          createdAt: Date.now()
        })
      }
    );

    // Update order payment status
    await fetch(
      `${DATABASE_URL}/orders/${orderId}/paymentStatus.json?auth=${DATABASE_SECRET}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify('paid')
      }
    );

    await fetch(
      `${DATABASE_URL}/orders/${orderId}/paymentDetails.json?auth=${DATABASE_SECRET}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reference: reference || `WALLET-${Date.now()}`,
          gateway: 'wallet',
          amount: amount,
          paidAt: Date.now()
        })
      }
    );

    // Add notification
    const notifId = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
    await fetch(
      `${DATABASE_URL}/notifications/${uid}/${notifId}.json?auth=${DATABASE_SECRET}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'wallet',
          title: 'Payment Made 💳',
          message: `₦${Number(amount).toLocaleString()} has been deducted from your wallet for order #${orderId.slice(-8)}.`,
          data: {
            orderId: orderId,
            amount: amount,
            newBalance: newBalance
          },
          read: false,
          createdAt: Date.now()
        })
      }
    );

    return {
      success: true,
      data: {
        previousBalance: currentBalance,
        newBalance: newBalance,
        deductedAmount: amount,
        orderId: orderId
      }
    };

  } catch (error) {
    console.error('Process payment error:', error);
    return {
      success: false,
      message: error.message || 'Failed to process payment'
    };
  }
}

/**
 * Get Transaction History
 */
export async function getTransactionHistory(uid, limit = 20, offset = 0) {
  try {
    if (!DATABASE_URL || !DATABASE_SECRET) {
      console.error('❌ Firebase database credentials are not set');
      return { success: false, message: 'Database configuration error' };
    }

    if (!uid) {
      return { success: false, message: 'User UID is required' };
    }

    const response = await fetch(
      `${DATABASE_URL}/walletTransactions.json?auth=${DATABASE_SECRET}&orderBy="customerUid"&equalTo="${uid}"`
    );

    if (!response.ok) {
      throw new Error('Failed to fetch transactions');
    }

    const data = await response.json();

    if (!data) {
      return {
        success: true,
        data: {
          transactions: [],
          total: 0
        }
      };
    }

    const transactions = Object.entries(data)
      .map(([key, value]) => ({ ...value, id: key }))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    const total = transactions.length;
    const paginated = transactions.slice(offset, offset + limit);

    return {
      success: true,
      data: {
        transactions: paginated,
        total: total,
        limit: limit,
        offset: offset,
        hasMore: (offset + limit) < total
      }
    };

  } catch (error) {
    console.error('Get transaction history error:', error);
    return {
      success: false,
      message: error.message || 'Failed to get transaction history'
    };
  }
}

/**
 * Get Transaction by Reference
 */
export async function getTransactionByReference(reference) {
  try {
    if (!DATABASE_URL || !DATABASE_SECRET) {
      console.error('❌ Firebase database credentials are not set');
      return { success: false, message: 'Database configuration error' };
    }

    if (!reference) {
      return { success: false, message: 'Reference is required' };
    }

    const response = await fetch(
      `${DATABASE_URL}/walletTransactions.json?auth=${DATABASE_SECRET}&orderBy="reference"&equalTo="${reference}"`
    );

    if (!response.ok) {
      throw new Error('Failed to fetch transaction');
    }

    const data = await response.json();

    if (!data) {
      return {
        success: false,
        message: 'Transaction not found'
      };
    }

    const entries = Object.entries(data);
    const [key, value] = entries[0];

    return {
      success: true,
      data: {
        ...value,
        id: key
      }
    };

  } catch (error) {
    console.error('Get transaction by reference error:', error);
    return {
      success: false,
      message: error.message || 'Failed to get transaction'
    };
  }
}

/**
 * Refund Transaction
 */
export async function refundTransaction(uid, amount, reference, reason = 'Refund') {
  try {
    if (!DATABASE_URL || !DATABASE_SECRET) {
      console.error('❌ Firebase database credentials are not set');
      return { success: false, message: 'Database configuration error' };
    }

    if (!uid || !amount || !reference) {
      return { success: false, message: 'Missing required fields' };
    }

    // Get current balance
    const balanceResponse = await fetch(
      `${DATABASE_URL}/wallets/${uid}/balance.json?auth=${DATABASE_SECRET}`
    );
    const currentBalance = await balanceResponse.json() || 0;
    const newBalance = currentBalance + amount;

    // Update balance
    await fetch(
      `${DATABASE_URL}/wallets/${uid}/balance.json?auth=${DATABASE_SECRET}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newBalance)
      }
    );

    // Add transaction record
    const txId = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
    await fetch(
      `${DATABASE_URL}/walletTransactions/${txId}.json?auth=${DATABASE_SECRET}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerUid: uid,
          type: 'refund',
          amount: amount,
          balanceBefore: currentBalance,
          balanceAfter: newBalance,
          reference: `REFUND-${reference}`,
          status: 'completed',
          method: 'wallet',
          description: reason || `Refund for ${reference}`,
          metadata: { originalReference: reference },
          createdAt: Date.now()
        })
      }
    );

    // Add notification
    const notifId = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
    await fetch(
      `${DATABASE_URL}/notifications/${uid}/${notifId}.json?auth=${DATABASE_SECRET}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'wallet',
          title: 'Refund Processed ↩️',
          message: `₦${Number(amount).toLocaleString()} has been refunded to your wallet.`,
          data: {
            amount: amount,
            reference: reference,
            newBalance: newBalance
          },
          read: false,
          createdAt: Date.now()
        })
      }
    );

    return {
      success: true,
      data: {
        previousBalance: currentBalance,
        newBalance: newBalance,
        refundedAmount: amount,
        reference: reference
      }
    };

  } catch (error) {
    console.error('Refund transaction error:', error);
    return {
      success: false,
      message: error.message || 'Failed to process refund'
    };
  }
}

/**
 * Export all functions
 */
export default {
  getBalance,
  fundWallet,
  processPayment,
  getTransactionHistory,
  getTransactionByReference,
  refundTransaction
};