// api/wallet/fund.js
const DATABASE_URL = process.env.FIREBASE_DATABASE_URL;
const DATABASE_SECRET = process.env.FIREBASE_DATABASE_SECRET;

/**
 * Fund Wallet (After Paystack Payment)
 * POST /api/wallet/fund
 * 
 * Request Body:
 * {
 *   uid: string,
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
    const { uid, amount, reference } = req.body;

    if (!DATABASE_URL || !DATABASE_SECRET) {
      console.error('❌ Firebase database credentials are not set');
      return res.status(500).json({
        success: false,
        message: 'Database configuration error.'
      });
    }

    if (!uid || !amount || !reference) {
      return res.status(400).json({
        success: false,
        message: 'UID, amount, and reference are required.'
      });
    }

    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be greater than 0.'
      });
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
          reference: reference,
          status: 'completed',
          method: 'paystack',
          description: `Wallet funding via Paystack (${reference})`,
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

    return res.status(200).json({
      success: true,
      message: 'Wallet funded successfully.',
      data: {
        previousBalance: currentBalance,
        newBalance: newBalance,
        fundedAmount: amount
      }
    });

  } catch (error) {
    console.error('Fund wallet error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fund wallet.'
    });
  }
}