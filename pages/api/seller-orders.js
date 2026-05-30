const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const AIRTABLE_BASE  = process.env.AIRTABLE_BASE_ID;

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { seller_username } = req.query;
  if (!seller_username) return res.status(400).json({ error: 'seller_username مطلوب' });

  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE) {
    console.error('[seller-orders] Missing env vars');
    return res.status(500).json({ error: 'إعدادات السيرفر ناقصة' });
  }

  try {
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/Orders?filterByFormula=${encodeURIComponent(`{seller_username}="${seller_username}"`)}`;
    console.log('[seller-orders] Fetching orders for seller:', seller_username);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` }
    });

    console.log('[seller-orders] Airtable status:', response.status);
    if (!response.ok) {
      const errText = await response.text();
      console.error('[seller-orders] Airtable error:', errText);
      return res.status(502).json({ error: `Airtable: ${response.status} — تحقق من AIRTABLE_TOKEN`, records: [] });
    }

    const data = await response.json();
    console.log('[seller-orders] Found records:', data.records?.length ?? 0);
    return res.status(200).json({ records: data.records || [] });
  } catch (error) {
    console.error('[seller-orders] Unexpected error:', error);
    return res.status(500).json({ error: 'خطأ في الاتصال بـ Airtable', records: [] });
  }
}
