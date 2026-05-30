import crypto from 'crypto';
import { rateLimit } from './_rateLimit';

export const config = { api: { bodyParser: false } };

// ── أدوات مساعدة ──────────────────────────────────────────

async function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', chunk => { data += chunk; });
    req.on('end',  () => resolve(data));
    req.on('error', reject);
  });
}

function verifyPiSignature(rawBody, signature, secret) {
  if (!signature) return false;
  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch { return false; }
}

async function airtable(token, base, method, path, body) {
  const res = await fetch(`https://api.airtable.com/v0/${base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  return res.json();
}

// ── Handler الرئيسي ────────────────────────────────────────

export default async function handler(req, res) {
  const PI_KEY  = process.env.PI_NETWORK_API_KEY;
  const AT_TOK  = process.env.AIRTABLE_TOKEN;
  const AT_BASE = process.env.AIRTABLE_BASE_ID;

  // ── GET: Health check — يُستخدم للتحقق من الـ endpoint في Pi Developer Portal
  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'ok',
      service: 'Souq Pi Webhook',
      timestamp: new Date().toISOString()
    });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Rate limit: 120 webhook calls per minute per IP (generous for Pi's servers)
  if (!rateLimit(req, res, {
    limit: 120,
    windowMs: 60_000,
    message: 'Rate limit exceeded'
  })) return;

  if (!PI_KEY || !AT_TOK || !AT_BASE) {
    return res.status(500).json({ error: 'Server configuration missing' });
  }

  const rawBody = await readRawBody(req);

  // ── التحقق من توقيع Pi Network ─────────────────────────
  const piSig = req.headers['x-pi-signature'] || req.headers['pi-signature'] || '';
  if (piSig) {
    if (!verifyPiSignature(rawBody, piSig, PI_KEY)) {
      console.error('[webhook] ❌ Invalid Pi signature — rejected');
      return res.status(401).json({ error: 'Unauthorized — invalid signature' });
    }
    console.log('[webhook] ✅ Signature verified');
  } else {
    console.warn('[webhook] ⚠️  No signature header (dev mode)');
  }

  let body;
  try { body = JSON.parse(rawBody); }
  catch { return res.status(400).json({ error: 'Invalid JSON body' }); }

  const { event_type, payment } = body;
  console.log(`[webhook] ▶ Event: ${event_type} | id: ${payment?.identifier}`);

  // أرسل 200 فوراً حتى لا يتجاوز Pi مهلة الـ 10 ثوانٍ
  res.status(200).json({ received: true });

  // ── معالجة الأحداث بعد الرد ────────────────────────────
  setImmediate(async () => {
    try {
      await processEvent(event_type, payment, PI_KEY, AT_TOK, AT_BASE);
    } catch (err) {
      console.error('[webhook] processEvent error:', err.message);
    }
  });
}

// ── معالجة كل أنواع الأحداث ────────────────────────────────

async function processEvent(event_type, payment, PI_KEY, AT_TOK, AT_BASE) {
  if (!payment) return;
  const paymentId = payment.identifier;

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 1. payment_approved — الموافقة تمت (تسجيل فقط)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (event_type === 'payment_approved') {
    console.log(`[webhook] ✅ Payment approved: ${paymentId}`);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 2. payment_completed — الدفع مكتمل على البلوكشين
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (event_type === 'payment_completed') {
    const txid      = payment.transaction?.txid || '';
    const direction = payment.direction;         // 'user_to_app' | 'app_to_user'
    const isRefund  = direction === 'app_to_user' || payment.metadata?.type === 'refund';

    // ── A2U: استرجاع مكتمل → حدّث Refunds تلقائياً ─────
    if (isRefund) {
      const originalPayId = payment.metadata?.original_payment_id;
      if (!originalPayId) { console.warn('[webhook] A2U without original_payment_id'); return; }

      const search = await airtable(AT_TOK, AT_BASE, 'GET',
        `/Refunds?filterByFormula=${encodeURIComponent(`{payment_id}="${originalPayId}"`)}`);

      if (search.records?.length > 0) {
        const rid = search.records[0].id;
        await airtable(AT_TOK, AT_BASE, 'PATCH', `/Refunds/${rid}`,
          { fields: { status: 'completed', refund_txid: txid } });
        console.log(`[webhook] ✅ Refund auto-completed | order=${originalPayId} | txid=${txid}`);
      } else {
        console.warn(`[webhook] ⚠️  No Refund record for payment_id=${originalPayId}`);
      }
      return;
    }

    // ── U2A: شراء عادي → أكمل + احفظ في Orders إذا فاته الـ Frontend ─
    if (direction === 'user_to_app' && txid) {
      // 2a. أبلغ Pi بالإتمام (آمن لو طُلب مرة ثانية)
      try {
        const completeRes = await fetch(`https://api.minepi.com/v2/payments/${paymentId}/complete`, {
          method: 'POST',
          headers: { Authorization: `Key ${PI_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ txid })
        });
        if (completeRes.ok) {
          console.log(`[webhook] ✅ U2A complete called for: ${paymentId}`);
        }
      } catch (e) { console.warn('[webhook] complete call failed:', e.message); }

      // 2b. احفظ في Orders إذا لم يكن موجوداً (الـ Frontend ربما فشل)
      const existCheck = await airtable(AT_TOK, AT_BASE, 'GET',
        `/Orders?filterByFormula=${encodeURIComponent(`{payment_id}="${paymentId}"`)}`);

      if (!existCheck.records?.length) {
        const meta      = payment.metadata || {};
        const username  = payment.user_uid || '';          // Pi قد يُرسل uid
        const buyerUid  = payment.user_uid || '';
        const productId = meta.id || '';
        const productName = payment.memo || '';
        const amountPi  = parseFloat(payment.amount) || 0;

        await airtable(AT_TOK, AT_BASE, 'POST', '/Orders', {
          fields: {
            username,
            buyer_uid:       buyerUid,
            product_id:      productId,
            product_name:    productName,
            amount_pi:       amountPi,
            payment_id:      paymentId,
            txid,
            table_name:      meta.table || '',
            seller_username: meta.seller || ''
          }
        });
        console.log(`[webhook] ✅ Order auto-saved (fallback) | payment_id=${paymentId}`);
      } else {
        console.log(`[webhook] ℹ️  Order already in Airtable — skipped`);
      }
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 3. payment_cancelled — الدفع ملغي → سجّل في السجلات
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (event_type === 'payment_cancelled') {
    console.log(`[webhook] 🚫 Payment cancelled: ${paymentId}`);
    // لا يوجد جدول للملغيات حالياً — يمكن إضافته لاحقاً
  }
}
