const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const AIRTABLE_BASE  = process.env.AIRTABLE_BASE_ID;

export default async function handler(req, res) {
  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE) {
    return res.status(500).json({ error: 'Server configuration missing' });
  }

  // ── GET: جلب تنبيهات بائع معين ───────────────────────
  if (req.method === 'GET') {
    const { seller_username } = req.query;
    if (!seller_username) return res.status(400).json({ error: 'seller_username مطلوب' });

    try {
      const formula = encodeURIComponent(`{seller_username}="${seller_username}"`);
      const response = await fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE}/Seller_Notifications?filterByFormula=${formula}&sort[0][field]=created_at&sort[0][direction]=desc`,
        { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
      );
      const data = await response.json();
      return res.status(200).json({ records: data.records || [] });
    } catch (e) {
      return res.status(500).json({ error: 'فشل جلب التنبيهات' });
    }
  }

  // ── PATCH: تعليم تنبيه كمقروء ─────────────────────────
  if (req.method === 'PATCH') {
    const { recordId } = req.body;
    if (!recordId) return res.status(400).json({ error: 'recordId مطلوب' });

    try {
      const response = await fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE}/Seller_Notifications/${recordId}`,
        {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: { is_read: true } })
        }
      );
      const data = await response.json();
      return res.status(200).json({ success: true, data });
    } catch (e) {
      return res.status(500).json({ error: 'فشل تحديث التنبيه' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
