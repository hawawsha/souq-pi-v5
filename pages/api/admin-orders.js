const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const AIRTABLE_BASE  = process.env.AIRTABLE_BASE_ID;
const ADMIN_KEY      = process.env.ADMIN_SECRET_KEY;

function auth(req) {
  return req.headers['x-admin-key'] === ADMIN_KEY;
}

export default async function handler(req, res) {
  if (!auth(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE) return res.status(500).json({ error: 'Config missing' });

  // GET — list all orders
  if (req.method === 'GET') {
    try {
      const response = await fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE}/Orders?sort[0][field]=created_at&sort[0][direction]=desc`,
        { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
      );
      const data = await response.json();
      return res.status(200).json({ records: data.records || [] });
    } catch (e) {
      return res.status(500).json({ error: 'فشل جلب الطلبات' });
    }
  }

  // PATCH — update order delivery_status
  if (req.method === 'PATCH') {
    const { recordId, delivery_status } = req.body || {};
    if (!recordId || !delivery_status) {
      return res.status(400).json({ error: 'recordId و delivery_status مطلوبان' });
    }
    const allowed = ['pending', 'shipped', 'delivered', 'cancelled'];
    if (!allowed.includes(delivery_status)) {
      return res.status(400).json({ error: `الحالة غير صالحة. المسموح: ${allowed.join(', ')}` });
    }
    try {
      const r = await fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE}/Orders/${recordId}`,
        {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: { delivery_status } })
        }
      );
      if (!r.ok) {
        const err = await r.text();
        return res.status(500).json({ error: `Airtable error: ${err}` });
      }
      const data = await r.json();
      return res.status(200).json({ success: true, record: data });
    } catch (e) {
      return res.status(500).json({ error: 'فشل تحديث حالة الطلب' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
