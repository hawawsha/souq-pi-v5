const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const AIRTABLE_BASE  = process.env.AIRTABLE_BASE_ID;
const TABLES         = ['Cars', 'Electronics', 'Electric', 'Real_Estate'];

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE) return res.status(500).json({ error: 'Config missing' });

  const q = (req.query.q || '').trim().toLowerCase();
  if (!q || q.length < 2) return res.status(200).json({ records: [] });

  try {
    const results = await Promise.all(
      TABLES.map(async (table) => {
        const formula = encodeURIComponent(`SEARCH("${q.replace(/"/g, '')}", LOWER({name}))`);
        const r = await fetch(
          `https://api.airtable.com/v0/${AIRTABLE_BASE}/${table}?filterByFormula=${formula}&maxRecords=6`,
          { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
        );
        const d = await r.json();
        return (d.records || []).map(rec => ({ ...rec, _table: table }));
      })
    );
    return res.status(200).json({ records: results.flat() });
  } catch (e) {
    return res.status(500).json({ error: 'فشل البحث' });
  }
}
