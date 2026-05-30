import { rateLimit } from './_rateLimit';

function sanitize(str, maxLen = 200) {
  if (typeof str !== 'string') return '';
  return str.trim().slice(0, maxLen).replace(/[<>'"]/g, '');
}

function buildSellerWaLink(whatsapp, { buyerUsername, productName, amountPi, paymentId }) {
  if (!whatsapp) return '';
  const phone = whatsapp.replace(/\D/g, '');
  const msg   = encodeURIComponent(
    `🛍️ طلب جديد في Souq Pi\n\nالمنتج: ${productName}\nالمبلغ: π ${amountPi}\nالمشتري: @${buyerUsername}\nرقم الدفع: ${paymentId}`
  );
  return `https://wa.me/${phone}?text=${msg}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Rate limit: 20 payment requests per minute per IP
  if (!rateLimit(req, res, {
    limit: 20,
    windowMs: 60_000,
    message: 'حدٌّ أقصى للطلبات — يرجى المحاولة بعد دقيقة'
  })) return;

  const API_KEY              = process.env.PI_NETWORK_API_KEY;
  const AIRTABLE_TOKEN       = process.env.AIRTABLE_TOKEN;
  const AIRTABLE_BASE        = process.env.AIRTABLE_BASE_ID;
  const MAINNET_WALLET       = process.env.MAINNET_WALLET_ADDRESS || '';

  if (!API_KEY || !AIRTABLE_TOKEN || !AIRTABLE_BASE) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const action         = sanitize(req.body?.action, 20);
  const paymentId      = sanitize(req.body?.paymentId, 100);
  const txid           = sanitize(req.body?.txid, 100);
  const username       = sanitize(req.body?.username, 50);
  const buyerUid       = sanitize(req.body?.buyer_uid, 100);

  let buyerWallet = '';
  if (typeof req.body?.buyer_wallet === 'string') buyerWallet = req.body.buyer_wallet.trim();
  if (!buyerWallet && typeof req.body?.wallet_address === 'string') buyerWallet = req.body.wallet_address.trim();
  buyerWallet = buyerWallet.slice(0, 120);

  const productId      = sanitize(req.body?.productId, 50);
  const productName    = sanitize(req.body?.productName, 200);
  const tableName      = sanitize(req.body?.tableName, 50);
  const sellerUsername = sanitize(req.body?.sellerUsername, 50);
  const amountPi       = parseFloat(req.body?.amountPi);

  if (!action || !paymentId) return res.status(400).json({ error: 'بيانات ناقصة' });
  if (!['approve', 'complete'].includes(action)) return res.status(400).json({ error: 'action غير صالح' });

  try {

    // ═══════════════ APPROVE ═══════════════
    if (action === 'approve') {
      const approveRes = await fetch(
        `https://api.minepi.com/v2/payments/${paymentId}/approve`,
        { method: 'POST', headers: { Authorization: `Key ${API_KEY}`, 'Content-Type': 'application/json' } }
      );
      if (!approveRes.ok) {
        const err = await approveRes.text();
        console.error('[payment/approve] Pi error:', err);
        return res.status(400).json({ error: 'فشل الموافقة على الدفع' });
      }
      return res.status(200).json({ message: 'Approved' });
    }

    // ═══════════════ COMPLETE ═══════════════
    if (action === 'complete') {
      if (!txid) return res.status(400).json({ error: 'txid مطلوب' });

      const completeRes = await fetch(
        `https://api.minepi.com/v2/payments/${paymentId}/complete`,
        {
          method: 'POST',
          headers: { Authorization: `Key ${API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ txid })
        }
      );
      if (!completeRes.ok) {
        const err = await completeRes.text();
        console.error('[payment/complete] Pi error:', err);
        return res.status(400).json({ error: 'فشل إكمال الدفع' });
      }

      // Idempotency — prevent duplicate orders
      const checkRes = await fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE}/Orders?filterByFormula=${encodeURIComponent(`{payment_id}="${paymentId}"`)}`,
        { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
      );
      const checkData = await checkRes.json();
      if (checkData.records?.length > 0) {
        return res.status(200).json({ message: 'Already saved', orderId: checkData.records[0].id });
      }

      const safeAmount = !isNaN(amountPi) && amountPi > 0 ? amountPi : 0;

      // ── Save Order ──
      const saveRes = await fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE}/Orders`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: {
              username:         username       || '',
              buyer_uid:        buyerUid       || '',
              buyer_wallet:     buyerWallet    || '',
              product_id:       productId      || '',
              product_name:     productName    || '',
              amount_pi:        safeAmount,
              payment_id:       paymentId,
              txid,
              table_name:       tableName      || '',
              seller_username:  sellerUsername || '',
              app_wallet:       MAINNET_WALLET || '',
              delivery_status:  'pending'
            }
          })
        }
      );

      if (!saveRes.ok) {
        const err = await saveRes.text();
        console.error('[payment/complete] Airtable save error:', err);
        return res.status(500).json({ error: 'فشل حفظ الطلب' });
      }

      const savedOrder = await saveRes.json();
      console.log('[payment] saved order:', savedOrder.id);

      // ── Seller Notification with wa.me link ──
      if (sellerUsername) {
        try {
          const sellerRes  = await fetch(
            `https://api.airtable.com/v0/${AIRTABLE_BASE}/Sellers_Requests?filterByFormula=${encodeURIComponent(`AND({username}="${sellerUsername}",{status}="approved")`)}`,
            { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
          );
          const sellerData    = await sellerRes.json();
          const sellerRecord  = sellerData.records?.[0]?.fields || {};
          const sellerWhatsapp = sellerRecord.whatsapp || '';

          // Build a pre-filled wa.me link for the seller to tap in their notification
          const waLink = buildSellerWaLink(sellerWhatsapp, {
            buyerUsername: username,
            productName,
            amountPi:      safeAmount,
            paymentId
          });

          await fetch(
            `https://api.airtable.com/v0/${AIRTABLE_BASE}/Seller_Notifications`,
            {
              method: 'POST',
              headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                fields: {
                  seller_username: sellerUsername,
                  seller_whatsapp: sellerWhatsapp,
                  wa_link:         waLink,
                  buyer_username:  username,
                  product_name:    productName,
                  amount_pi:       safeAmount,
                  payment_id:      paymentId,
                  order_id:        savedOrder.id,
                  is_read:         false
                }
              })
            }
          );
        } catch (notifErr) {
          console.warn('[payment] notification failed:', notifErr.message);
        }
      }

      return res.status(200).json({
        message:  'Completed',
        orderId:  savedOrder.id,
        buyer_wallet: buyerWallet,
        track_url:    `/order/${savedOrder.id}`
      });
    }

  } catch (err) {
    console.error('[payment] Unexpected error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
