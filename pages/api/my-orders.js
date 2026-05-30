const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const AIRTABLE_BASE  = process.env.AIRTABLE_BASE_ID;

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { username } = req.query;
  if (!username) return res.status(400).json({ error: 'username مطلوب' });

  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE) {
    console.error('[my-orders] Missing env vars: AIRTABLE_TOKEN or AIRTABLE_BASE_ID');
    return res.status(500).json({ error: 'إعدادات السيرفر ناقصة' });
  }

  try {
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/Orders?filterByFormula=${encodeURIComponent(`{username}="${username}"`)}`;
    console.log('[my-orders] Fetching orders for:', username);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` }
    });

    console.log('[my-orders] Airtable status:', response.status);
    if (!response.ok) {
      const errText = await response.text();
      console.error('[my-orders] Airtable error:', errText);
      return res.status(502).json({ error: `Airtable: ${response.status} — تحقق من AIRTABLE_TOKEN`, records: [] });
    }

    const data = await response.json();
    console.log('[my-orders] Found records:', data.records?.length ?? 0);
    return res.status(200).json({ records: data.records || [] });
  } catch (error) {
    console.error('[my-orders] Unexpected error:', error);
    return res.status(500).json({ error: 'خطأ في الاتصال بـ Airtable', records: [] });
  }
}
