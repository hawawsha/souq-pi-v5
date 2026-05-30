const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const AIRTABLE_BASE  = process.env.AIRTABLE_BASE_ID;
const PI_API_KEY     = process.env.PI_NETWORK_API_KEY;

const AT = async (path, method = 'GET', body) => {
  const r = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${AIRTABLE_TOKEN}`,
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  return { ok: r.ok, status: r.status, data: await r.json() };
};

async function handleA2URefund({ buyerUid, buyerWallet, amountPi, originalPaymentId, productName }) {
  if (!PI_API_KEY) throw new Error('PI_NETWORK_API_KEY غير مُعيَّن');
  if (!buyerUid && !buyerWallet) throw new Error('buyer_uid أو buyer_wallet مطلوب');
  if (!amountPi || amountPi <= 0) throw new Error('المبلغ غير صالح');

  const body = {
    amount:   amountPi,
    memo:     `استرجاع: ${productName || 'منتج'}`,
    metadata: { type: 'refund', original_payment_id: originalPaymentId },
  };
  if (buyerWallet) body.to_address = buyerWallet;
  else body.uid = buyerUid;

  // Step 1: Create A2U payment
  const createRes = await fetch('https://api.minepi.com/v2/payments', {
    method: 'POST',
    headers: { Authorization: `Key ${PI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!createRes.ok) {
    const errText = await createRes.text();
    console.error('[refund/A2U] Create failed:', errText);
    throw new Error(`Pi API رفض إنشاء الدفعة (${createRes.status}): ${errText.slice(0, 200)}`);
  }
  const createData  = await createRes.json();
  const refundPayId = createData.identifier;
  if (!refundPayId) throw new Error('لم يُرجع Pi معرّف الدفعة');

  // Step 2: Approve A2U payment
  const approveRes = await fetch(`https://api.minepi.com/v2/payments/${refundPayId}/approve`, {
    method: 'POST',
    headers: { Authorization: `Key ${PI_API_KEY}` }
  });
  if (!approveRes.ok) {
    const errText = await approveRes.text();
    console.error('[refund/A2U] Approve failed:', errText);
    throw new Error(`Pi API رفض الموافقة (${approveRes.status}): ${errText.slice(0, 200)}`);
  }

  console.log(`[refund/A2U] ✅ Created & approved | id=${refundPayId} | amount=${amountPi}π`);
  return refundPayId;
}

async function markManualRefundNeeded(recordId, { buyerWallet, buyerUid, amountPi, errorMsg }) {
  const waPhone = buyerWallet ? '' : '';
  await AT(`/Refunds/${recordId}`, 'PATCH', {
    fields: {
      status:              'manual_refund_needed',
      a2u_error:           errorMsg,
      buyer_wallet:        buyerWallet || '',
      buyer_uid:           buyerUid    || '',
      manual_refund_note:  `يرجى إرسال π ${amountPi} يدوياً إلى المحفظة: ${buyerWallet || 'غير محدد'} | UID: ${buyerUid || 'غير محدد'}`
    }
  });
}

export default async function handler(req, res) {

  // GET — list refunds
  if (req.method === 'GET' && req.query.action === 'list') {
    try {
      const { data } = await AT(
        `/Refunds?sort[0][field]=created_at&sort[0][direction]=desc`
      );
      return res.status(200).json({ records: data.records || [] });
    } catch {
      return res.status(500).json({ error: 'فشل جلب طلبات الاسترجاع' });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    action, recordId,
    buyer_username, buyer_uid, buyer_wallet,
    product_id, product_name, payment_id, amount_pi
  } = req.body || {};

  if (!action) return res.status(400).json({ error: 'Missing action' });

  // ── REQUEST ──────────────────────────────────────────────
  if (action === 'request') {
    if (!buyer_username || !payment_id) {
      return res.status(400).json({ error: 'buyer_username و payment_id مطلوبان' });
    }
    try {
      const orderCheck = await AT(
        `/Orders?filterByFormula=${encodeURIComponent(`AND({payment_id}="${payment_id}",{username}="${buyer_username}")`)}`
      );
      if (!orderCheck.data.records?.length) {
        return res.status(403).json({ error: 'لا يوجد طلب مدفوع بهذا المعرّف — الاسترجاع مرفوض' });
      }

      const order            = orderCheck.data.records[0].fields;
      const savedBuyerUid    = buyer_uid    || order.buyer_uid    || '';
      const savedBuyerWallet = buyer_wallet || order.buyer_wallet || '';
      const savedAmount      = amount_pi    || order.amount_pi    || 0;
      const savedProduct     = product_name || order.product_name || '';

      const dupCheck = await AT(
        `/Refunds?filterByFormula=${encodeURIComponent(`{payment_id}="${payment_id}"`)}`
      );
      if (dupCheck.data.records?.length) {
        return res.status(200).json({ message: 'طلب استرجاع موجود مسبقاً' });
      }

      const { ok, data: saveData } = await AT('/Refunds', 'POST', {
        fields: {
          buyer_username,
          buyer_uid:    savedBuyerUid,
          buyer_wallet: savedBuyerWallet,
          product_id:   product_id || '',
          product_name: savedProduct,
          payment_id,
          amount_pi:    parseFloat(savedAmount) || 0,
          status:       'pending'
        }
      });
      if (!ok) return res.status(500).json({ error: 'فشل حفظ طلب الاسترجاع' });
      return res.status(200).json({ success: true, data: saveData });
    } catch (e) {
      console.error('[refund/request]', e);
      return res.status(500).json({ error: e.message });
    }
  }

  // ── APPROVE ──────────────────────────────────────────────
  if (action === 'approve') {
    if (!recordId) return res.status(400).json({ error: 'recordId مطلوب' });
    try {
      const { ok: rOk, data: refundRecord } = await AT(`/Refunds/${recordId}`);
      if (!rOk) return res.status(404).json({ error: 'سجل الاسترجاع غير موجود' });
      const f = refundRecord.fields;

      const orderCheck = await AT(
        `/Orders?filterByFormula=${encodeURIComponent(`{payment_id}="${f.payment_id}"`)}`
      );
      if (!orderCheck.data.records?.length) {
        return res.status(403).json({ error: 'لا يوجد دفع مسجّل لهذا الطلب' });
      }

      const order            = orderCheck.data.records[0].fields;
      const buyerUidFinal    = f.buyer_uid    || order.buyer_uid    || '';
      const buyerWalletFinal = f.buyer_wallet || order.buyer_wallet || '';
      const amountFinal      = parseFloat(f.amount_pi) || parseFloat(order.amount_pi) || 0;
      const productFinal     = f.product_name || order.product_name || 'منتج';

      if (!buyerUidFinal && !buyerWalletFinal) {
        // Mark manual and return wallet info for admin to process manually
        await AT(`/Refunds/${recordId}`, 'PATCH', {
          fields: {
            status:             'manual_refund_needed',
            manual_refund_note: 'buyer_uid و buyer_wallet غير موجودان — يرجى إرسال الاسترجاع يدوياً'
          }
        });
        return res.status(400).json({
          error:         'buyer_uid و buyer_wallet غير موجودان',
          manual_action: 'يرجى إرسال الاسترجاع يدوياً عبر Pi Developer Portal',
          amount_pi:     amountFinal,
          product:       productFinal
        });
      }

      // ── Try A2U via Pi API ──
      let refundPaymentId = null;
      let a2uFailed = false;
      let a2uError  = '';

      try {
        refundPaymentId = await handleA2URefund({
          buyerUid:          buyerUidFinal,
          buyerWallet:       buyerWalletFinal,
          amountPi:          amountFinal,
          originalPaymentId: f.payment_id,
          productName:       productFinal
        });
      } catch (a2uErr) {
        a2uFailed = true;
        a2uError  = a2uErr.message;
        console.error('[refund/approve] A2U failed — falling back to manual:', a2uError);
      }

      if (a2uFailed) {
        // ── Fallback: mark as manual_refund_needed ──
        await markManualRefundNeeded(recordId, {
          buyerWallet: buyerWalletFinal,
          buyerUid:    buyerUidFinal,
          amountPi:    amountFinal,
          errorMsg:    a2uError
        });
        return res.status(200).json({
          success:         false,
          manual_required: true,
          message:         'فشل A2U تلقائياً — يرجى إرسال الاسترجاع يدوياً',
          buyer_wallet:    buyerWalletFinal,
          buyer_uid:       buyerUidFinal,
          amount_pi:       amountFinal,
          product:         productFinal,
          a2u_error:       a2uError,
          wa_admin_hint:   buyerWalletFinal
            ? `أرسل π ${amountFinal} إلى محفظة: ${buyerWalletFinal}`
            : `أرسل π ${amountFinal} إلى UID: ${buyerUidFinal}`
        });
      }

      // ── A2U succeeded ── update Refunds record
      const { data: patchData } = await AT(`/Refunds/${recordId}`, 'PATCH', {
        fields: { status: 'approved', refund_payment_id: refundPaymentId }
      });
      return res.status(200).json({ success: true, refundPaymentId, data: patchData });

    } catch (e) {
      console.error('[refund/approve]', e);
      return res.status(500).json({ error: e.message });
    }
  }

  // ── REJECT ──────────────────────────────────────────────
  if (action === 'reject') {
    if (!recordId) return res.status(400).json({ error: 'recordId مطلوب' });
    try {
      const { data } = await AT(`/Refunds/${recordId}`, 'PATCH', {
        fields: { status: 'rejected' }
      });
      return res.status(200).json({ success: true, data });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(400).json({ error: 'action غير معروف' });
}
