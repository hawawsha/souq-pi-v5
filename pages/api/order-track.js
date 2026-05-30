const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const AIRTABLE_BASE  = process.env.AIRTABLE_BASE_ID;

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE) return res.status(500).json({ error: 'Config missing' });

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'id مطلوب' });

  try {
    const r = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE}/Orders/${id}`,
      { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
    );
    if (!r.ok) return res.status(404).json({ error: 'الطلب غير موجود' });
    const record = await r.json();
    const f = record.fields;

    // Return only safe public fields — no buyer_uid, no wallet
    return res.status(200).json({
      id: record.id,
      product_name:    f.product_name    || '',
      amount_pi:       f.amount_pi       || 0,
      table_name:      f.table_name      || '',
      seller_username: f.seller_username || '',
      seller_whatsapp: f.seller_whatsapp || '',
      payment_id:      f.payment_id      || '',
      txid:            f.txid            || '',
      delivery_status: f.delivery_status || 'pending',
      created_at:      f.created_at      || ''
    });
  } catch (e) {
    return res.status(500).json({ error: 'خطأ في جلب الطلب' });
  }
}
