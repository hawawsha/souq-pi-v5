const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const AIRTABLE_BASE  = process.env.AIRTABLE_BASE_ID;
const VALID_TABLES   = ['Cars', 'Electronics', 'Electric', 'Real_Estate'];

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { table } = req.query;
  if (!table || !VALID_TABLES.includes(table)) {
    return res.status(400).json({ error: 'اسم الجدول غير صالح', records: [] });
  }

  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE) {
    console.error('[products] Missing env vars: AIRTABLE_TOKEN or AIRTABLE_BASE_ID');
    return res.status(500).json({ error: 'إعدادات السيرفر ناقصة', records: [] });
  }

  try {
    console.log('[products] Fetching table:', table);
    const response = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE}/${table}`,
      { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
    );
    console.log('[products] Airtable status:', response.status, '| table:', table);

    if (!response.ok) {
      const errText = await response.text();
      console.error('[products] Airtable error:', errText);
      return res.status(502).json({ error: `Airtable ${response.status} — تحقق من AIRTABLE_TOKEN`, records: [] });
    }

    const data = await response.json();
    console.log('[products] Records returned:', data.records?.length ?? 0, 'from', table);
    return res.status(200).json({ records: data.records || [] });
  } catch (error) {
    console.error('[products] Unexpected error:', error);
    return res.status(500).json({ error: 'خطأ في الاتصال بـ Airtable', records: [] });
  }
}
