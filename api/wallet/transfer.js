// api/wallet/transfer.js
const DATABASE_URL = process.env.FIREBASE_DATABASE_URL;
const DATABASE_SECRET = process.env.FIREBASE_DATABASE_SECRET;

/**
 * Pay with Wallet
 * POST /api/wallet/transfer
 * 
 * Request Body:
 * {
 *   uid: string,
 *   orderId: string,
 *   amount: number,
 *   reference: string
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
    const { uid, orderId, amount, reference } = req.body;

    // === VALIDATE ===
    if (!DATABASE_URL || !DATABASE_SECRET) {
      console.error('❌ Firebase database credentials are not set');
      return res.status(500).json({
        success: false,
        message: 'Database configuration error.'
      });
    }

    if (!uid || !orderId || !amount) {
      return res.status(400).json({
        success: false,
        message: 'UID, orderId, and amount are required.'
      });
    }

    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be greater than 0.'
      });
    }

    // === GET WALLET BALANCE ===
    const balanceResponse = await fetch(
      `${DATABASE_URL}/wallets/${uid}/balance.json?auth=${DATABASE_SECRET}`
    );
    const currentBalance = await balanceResponse.json() || 0;

    // === CHECK SUFFICIENT BALANCE ===
    if (currentBalance < amount) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient wallet balance.',
        data: {
          currentBalance: currentBalance,
          required: amount,
          shortfall: amount - currentBalance
        }
      });
    }

    // === DEDUCT FROM WALLET ===
    const newBalance = currentBalance - amount;

    await fetch(
      `${DATABASE_URL}/wallets/${uid}/balance.json?auth=${DATABASE_SECRET}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newBalance)
      }
    );

    // === ADD TRANSACTION RECORD ===
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
          reference: reference || `ORDER-${orderId.slice(-8)}`,
          status: 'completed',
          method: 'wallet',
          description: `Order payment #${orderId.slice(-8)}`,
          metadata: { orderId: orderId },
          createdAt: Date.now()
        })
      }
    );

    // === UPDATE ORDER PAYMENT STATUS ===
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

    // === ADD NOTIFICATION ===
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

    return res.status(200).json({
      success: true,
      message: 'Payment successful via wallet.',
      data: {
        previousBalance: currentBalance,
        newBalance: newBalance,
        deductedAmount: amount,
        orderId: orderId
      }
    });

  } catch (error) {
    console.error('Wallet transfer error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to process wallet payment.'
    });
  }
}