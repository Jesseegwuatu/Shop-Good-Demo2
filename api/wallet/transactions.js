const { verifyToken } = require('../_lib/auth');
const { db } = require('../_lib/firebase');
const { success, error, options } = require('../_lib/response');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json(error('Method not allowed', 405));
  
  try {
    const user = await verifyToken(req);
    const { limit = 50, offset = 0 } = req.query;
    
    const snapshot = await db.ref('walletTransactions')
      .orderByChild('customerUid')
      .equalTo(user.uid)
      .limitToLast(Number(limit))
      .once('value');
    
    const data = snapshot.val();
    const transactions = data ? Object.values(data).reverse() : [];
    
    res.json(success({ transactions, count: transactions.length }));
  } catch (err) {
    console.error('Get transactions error:', err);
    res.status(500).json(error(err.message, 500));
  }
};