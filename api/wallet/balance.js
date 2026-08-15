// api/wallet/balance.js
const DATABASE_URL = process.env.FIREBASE_DATABASE_URL;
const DATABASE_SECRET = process.env.FIREBASE_DATABASE_SECRET;

/**
 * Get Wallet Balance
 * GET /api/wallet/balance?uid=USER_UID
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed. Use GET.'
    });
  }

  try {
    const { uid } = req.query;

    if (!DATABASE_URL || !DATABASE_SECRET) {
      console.error('❌ Firebase database credentials are not set');
      return res.status(500).json({
        success: false,
        message: 'Database configuration error.'
      });
    }

    if (!uid) {
      return res.status(400).json({
        success: false,
        message: 'User UID is required.'
      });
    }

    // Get balance
    const balanceResponse = await fetch(
      `${DATABASE_URL}/wallets/${uid}/balance.json?auth=${DATABASE_SECRET}`
    );

    if (!balanceResponse.ok) {
      throw new Error('Failed to fetch balance');
    }

    const balance = await balanceResponse.json() || 0;

    // Get recent transactions (last 5)
    const transactionsResponse = await fetch(
      `${DATABASE_URL}/walletTransactions.json?auth=${DATABASE_SECRET}&orderBy="customerUid"&equalTo="${uid}"&limitToLast=5`
    );

    let transactions = [];
    if (transactionsResponse.ok) {
      const txData = await transactionsResponse.json();
      if (txData) {
        transactions = Object.entries(txData)
          .map(([key, value]) => ({ ...value, id: key }))
          .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        balance: balance,
        transactions: transactions
      }
    });

  } catch (error) {
    console.error('Get balance error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to get balance.'
    });
  }
}