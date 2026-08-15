// api/webhooks/paystack.js
const DATABASE_URL = process.env.FIREBASE_DATABASE_URL;
const DATABASE_SECRET = process.env.FIREBASE_DATABASE_SECRET;

/**
 * Paystack Webhook Handler
 * POST /api/webhooks/paystack
 * 
 * Paystack sends webhook events for:
 * - charge.success
 * - charge.failed
 * - charge.pending
 * - transfer.success
 * - etc.
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
    // === VALIDATE ===
    if (!DATABASE_URL || !DATABASE_SECRET) {
      console.error('❌ Firebase database credentials are not set');
      return res.status(500).json({
        success: false,
        message: 'Database configuration error.'
      });
    }

    // === GET PAYSTACK EVENT ===
    const payload = req.body;
    const event = payload?.event;
    const data = payload?.data;

    console.log(`📨 Received Paystack webhook: ${event}`);

    // === VERIFY EVENT ===
    if (!event || !data) {
      console.error('Invalid webhook payload:', payload);
      return res.status(400).json({
        success: false,
        message: 'Invalid webhook payload.'
      });
    }

    // === HANDLE DIFFERENT EVENTS ===
    switch (event) {
      case 'charge.success':
        await handleChargeSuccess(data);
        break;

      case 'charge.failed':
        await handleChargeFailed(data);
        break;

      case 'charge.pending':
        await handleChargePending(data);
        break;

      case 'charge.dispute.created':
      case 'charge.dispute.resolved':
        await handleDispute(data);
        break;

      default:
        console.log(`⚠️ Unhandled webhook event: ${event}`);
    }

    // Always return 200 to acknowledge receipt
    return res.status(200).json({
      success: true,
      message: 'Webhook received.'
    });

  } catch (error) {
    console.error('Webhook error:', error);
    // Still return 200 to prevent Paystack from retrying
    return res.status(200).json({
      success: false,
      message: error.message || 'Webhook processing error.'
    });
  }
}

// ========================================
// HANDLE CHARGE SUCCESS
// ========================================
async function handleChargeSuccess(data) {
  const reference = data?.reference;
  const amount = data?.amount ? data.amount / 100 : 0; // Convert from kobo
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
    return;
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
}

// ========================================
// HANDLE CHARGE FAILED
// ========================================
async function handleChargeFailed(data) {
  const reference = data?.reference;
  console.log(`❌ Charge failed: ${reference}`);

  // Update pending transaction
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
}

// ========================================
// HANDLE CHARGE PENDING
// ========================================
async function handleChargePending(data) {
  const reference = data?.reference;
  console.log(`⏳ Charge pending: ${reference}`);

  // Update pending transaction
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
}

// ========================================
// HANDLE DISPUTE
// ========================================
async function handleDispute(data) {
  console.log(`⚠️ Dispute event: ${data?.dispute?.id}`);
  // Log dispute for admin review
}