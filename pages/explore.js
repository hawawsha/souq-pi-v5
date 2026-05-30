import { useState, useEffect, useRef, useMemo } from 'react';
import Head from 'next/head';

const SECTIONS = [
  { key: 'Cars',        ar: 'سيارات',      icon: '🚗' },
  { key: 'Electric',    ar: 'كهربائيات',   icon: '⚡' },
  { key: 'Electronics', ar: 'إلكترونيات',  icon: '📱' },
  { key: 'Real_Estate', ar: 'عقارات',      icon: '🏠' },
];

// Per-category filter config using exact Airtable field names
const CAT_FILTERS = {
  Cars: {
    brand:     { label: 'الماركة',    field: 'brand',     type: 'brand' },
    status:    { label: 'الحالة',     field: 'status',    type: 'select', opts: ['Available', 'Sold'], arMap: { Available: 'متاح', Sold: 'مباع' } },
  },
  Electronics: {
    brand:     { label: 'الماركة',    field: 'brand',     type: 'brand' },
    condition: { label: 'الوضع',      field: 'condition', type: 'select', opts: ['New', 'Used'],       arMap: { New: 'جديد', Used: 'مستعمل' } },
    status:    { label: 'الحالة',     field: 'status',    type: 'select', opts: ['Available', 'Sold'], arMap: { Available: 'متاح', Sold: 'مباع' } },
  },
  Electric: {
    brand:     { label: 'الماركة',    field: 'brand',     type: 'brand' },
    status:    { label: 'الحالة',     field: 'status',    type: 'select', opts: ['Available', 'Sold'], arMap: { Available: 'متاح', Sold: 'مباع' } },
  },
  Real_Estate: {
    type:      { label: 'النوع',      field: 'type',      type: 'select', opts: ['Villa', 'Apartment', 'Land'], arMap: { Villa: 'فيلا', Apartment: 'شقة', Land: 'أرض' } },
    location:  { label: 'الموقع',    field: 'location',  type: 'text' },
    status:    { label: 'الحالة',     field: 'status',    type: 'select', opts: ['Available', 'Sold'], arMap: { Available: 'متاح', Sold: 'مباع' } },
  },
};

export default function Explore() {
  const [user,          setUser]          = useState(null);
  const [allProducts,   setAllProducts]   = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [toast,         setToast]         = useState('');
  const [paying,        setPaying]        = useState(null);
  const [activeSection, setActiveSection] = useState('all');
  const [showFilters,   setShowFilters]   = useState(false);

  // ── General filters ──
  const [search,       setSearch]       = useState('');
  const [sellerSearch, setSellerSearch] = useState('');
  const [minPrice,     setMinPrice]     = useState('');
  const [maxPrice,     setMaxPrice]     = useState('');
  const [sortBy,       setSortBy]       = useState('default');

  // ── Smart per-category filters (keyed by field name) ──
  const [catFilters, setCatFilters] = useState({});
  // catFilters shape: { brand: 'Toyota', condition: 'New', status: 'Available', type: '', location: '' }

  const buyerWalletRef = useRef('');

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3000); }

  useEffect(() => {
    const initPi = () => {
      if (typeof window !== 'undefined' && window.Pi) {
        window.Pi.init({ version: '4.0', sandbox: false });
        window.Pi.authenticate(['username', 'payments', 'wallet_address'])
          .then(auth => {
            setUser(auth.user);
            if (auth.user?.wallet_address) buyerWalletRef.current = auth.user.wallet_address;
          })
          .catch(() => {});
      } else {
        setTimeout(initPi, 500);
      }
    };
    initPi();
    loadAll();
  }, []);

  // Reset cat filters when section changes
  useEffect(() => { setCatFilters({}); }, [activeSection]);

  async function loadAll() {
    setLoading(true);
    try {
      const results = await Promise.all(
        SECTIONS.map(s =>
          fetch(`/api/products?table=${s.key}`)
            .then(r => r.json())
            .then(d => (d.records || []).map(p => ({ ...p, _section: s.key, _sectionAr: s.ar, _sectionIcon: s.icon })))
            .catch(() => [])
        )
      );
      setAllProducts(results.flat());
    } catch { showToast('خطأ في التحميل'); }
    setLoading(false);
  }

  function setCatFilter(field, value) {
    setCatFilters(prev => ({ ...prev, [field]: prev[field] === value ? '' : value }));
  }

  function clearAllFilters() {
    setSearch(''); setSellerSearch('');
    setMinPrice(''); setMaxPrice('');
    setSortBy('default'); setCatFilters({});
    setActiveSection('all');
  }

  // ── Filtered & sorted list ──
  const filtered = useMemo(() => {
    let list = allProducts;

    // Category
    if (activeSection !== 'all') list = list.filter(p => p._section === activeSection);

    // General text search (name + seller + description)
    const q = search.trim().toLowerCase();
    if (q) list = list.filter(p =>
      (p.fields.name            || '').toLowerCase().includes(q) ||
      (p.fields.seller_username || '').toLowerCase().includes(q) ||
      (p.fields.description     || '').toLowerCase().includes(q)
    );

    // Dedicated seller filter
    const sq = sellerSearch.trim().toLowerCase();
    if (sq) list = list.filter(p => (p.fields.seller_username || '').toLowerCase().includes(sq));

    // Price range
    if (minPrice !== '') list = list.filter(p => (parseFloat(p.fields.price_pi) || 0) >= parseFloat(minPrice));
    if (maxPrice !== '') list = list.filter(p => (parseFloat(p.fields.price_pi) || 0) <= parseFloat(maxPrice));

    // Per-category smart filters
    Object.entries(catFilters).forEach(([field, value]) => {
      if (!value) return;
      if (field === 'location') {
        list = list.filter(p => (p.fields.location || '').toLowerCase().includes(value.toLowerCase()));
      } else if (field === 'brand') {
        list = list.filter(p => (p.fields.brand || '').toLowerCase().includes(value.toLowerCase()));
      } else {
        list = list.filter(p => (p.fields[field] || '') === value);
      }
    });

    // Sort
    if (sortBy === 'price_asc')  list = [...list].sort((a, b) => (parseFloat(a.fields.price_pi) || 0) - (parseFloat(b.fields.price_pi) || 0));
    if (sortBy === 'price_desc') list = [...list].sort((a, b) => (parseFloat(b.fields.price_pi) || 0) - (parseFloat(a.fields.price_pi) || 0));

    return list;
  }, [allProducts, activeSection, search, sellerSearch, minPrice, maxPrice, sortBy, catFilters]);

  // ── Unique brands for the active section ──
  const availableBrands = useMemo(() => {
    const sectionProducts = activeSection === 'all' ? allProducts : allProducts.filter(p => p._section === activeSection);
    const brands = [...new Set(sectionProducts.map(p => p.fields.brand).filter(Boolean))].sort();
    return brands;
  }, [allProducts, activeSection]);

  const activeFilterCount = [
    search, sellerSearch, minPrice, maxPrice,
    activeSection !== 'all' ? '1' : '',
    sortBy !== 'default' ? '1' : '',
    ...Object.values(catFilters).filter(Boolean),
  ].filter(Boolean).length;

  async function buyWithPi(p) {
    if (!user) { showToast('سجّل الدخول أولاً'); return; }
    setPaying(p.id);
    const callbacks = {
      onReadyForServerApproval: async (id) => {
        await fetch('/api/payment', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'approve', paymentId: id })
        });
      },
      onReadyForServerCompletion: async (id, tx) => {
        await fetch('/api/payment', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'complete', paymentId: id, txid: tx?.txid || tx,
            username: user.username, buyer_uid: user.uid || '',
            buyer_wallet: buyerWalletRef.current || user.wallet_address || '',
            productId: p.id, productName: p.fields.name,
            amountPi: p.fields.price_pi, tableName: p._section,
            sellerUsername: p.fields.seller_username || ''
          })
        });
        showToast('✅ تم الشراء بنجاح!');
        setPaying(null);
      },
      onCancel: () => setPaying(null),
      onError: () => { showToast('فشل الدفع'); setPaying(null); }
    };
    window.Pi.createPayment({
      amount: Number(p.fields.price_pi),
      memo: p.fields.name,
      metadata: { id: p.id }
    }, callbacks);
  }

  // ── Smart filter panel for a given section ──
  function SmartFilters({ section }) {
    const config = CAT_FILTERS[section];
    if (!config) return null;
    return (
      <div style={{ marginTop: 12, borderTop: '1px solid #1e0a3c', paddingTop: 12 }}>
        <div style={{ fontSize: '0.72em', color: '#c084fc', fontWeight: 700, marginBottom: 10 }}>
          ✦ فلاتر {SECTIONS.find(s => s.key === section)?.ar}
        </div>

        {/* Brand filter — show chips of available brands */}
        {config.brand && availableBrands.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: '0.68em', color: '#b0b0b0', marginBottom: 6 }}>الماركة</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {availableBrands.map(b => (
                <button
                  key={b}
                  onClick={() => setCatFilter('brand', b)}
                  style={{
                    background: catFilters.brand === b ? 'rgba(106,13,173,0.5)' : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${catFilters.brand === b ? '#6a0dad' : '#331a5e'}`,
                    color: catFilters.brand === b ? '#fff' : '#b0b0b0',
                    padding: '5px 12px', borderRadius: 20,
                    cursor: 'pointer', fontFamily: 'Cairo', fontSize: '0.78em', fontWeight: catFilters.brand === b ? 700 : 400
                  }}
                >{b}</button>
              ))}
              {catFilters.brand && (
                <button onClick={() => setCatFilter('brand', '')}
                  style={{ background: 'none', border: '1px solid #ef444455', color: '#ef4444', padding: '5px 10px', borderRadius: 20, cursor: 'pointer', fontFamily: 'Cairo', fontSize: '0.75em' }}>
                  ✕
                </button>
              )}
            </div>
          </div>
        )}

        {/* Brand text input fallback if no brands fetched yet */}
        {config.brand && availableBrands.length === 0 && !loading && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: '0.68em', color: '#b0b0b0', marginBottom: 6 }}>الماركة</div>
            <input
              style={{ width: '100%', background: '#0a0118', border: '1px solid #6a0dad', padding: '9px 12px', borderRadius: 12, color: '#fff', fontFamily: 'Cairo', fontSize: '0.85em', outline: 'none' }}
              type="text" placeholder="أدخل الماركة..."
              value={catFilters.brand || ''}
              onChange={e => setCatFilters(prev => ({ ...prev, brand: e.target.value }))}
            />
          </div>
        )}

        {/* Location text input (Real_Estate only) */}
        {config.location && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: '0.68em', color: '#b0b0b0', marginBottom: 6 }}>📍 الموقع</div>
            <input
              style={{ width: '100%', background: '#0a0118', border: '1px solid #6a0dad', padding: '9px 12px', borderRadius: 12, color: '#fff', fontFamily: 'Cairo', fontSize: '0.85em', outline: 'none' }}
              type="text" placeholder="مدينة أو منطقة..."
              value={catFilters.location || ''}
              onChange={e => setCatFilters(prev => ({ ...prev, location: e.target.value }))}
            />
          </div>
        )}

        {/* Select filters (condition, type, status) */}
        {Object.entries(config)
          .filter(([key, cfg]) => cfg.type === 'select')
          .map(([key, cfg]) => (
            <div key={key} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: '0.68em', color: '#b0b0b0', marginBottom: 6 }}>{cfg.label}</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {cfg.opts.map(opt => (
                  <button
                    key={opt}
                    onClick={() => setCatFilter(key, opt)}
                    style={{
                      background: catFilters[key] === opt ? 'rgba(106,13,173,0.5)' : 'rgba(255,255,255,0.05)',
                      border: `1px solid ${catFilters[key] === opt ? '#6a0dad' : '#331a5e'}`,
                      color: catFilters[key] === opt ? '#fff' : '#b0b0b0',
                      padding: '6px 14px', borderRadius: 20,
                      cursor: 'pointer', fontFamily: 'Cairo', fontSize: '0.8em',
                      fontWeight: catFilters[key] === opt ? 700 : 400
                    }}
                  >
                    {cfg.arMap?.[opt] || opt}
                  </button>
                ))}
                {catFilters[key] && (
                  <button onClick={() => setCatFilter(key, '')}
                    style={{ background: 'none', border: '1px solid #ef444455', color: '#ef4444', padding: '6px 10px', borderRadius: 20, cursor: 'pointer', fontFamily: 'Cairo', fontSize: '0.75em' }}>
                    ✕
                  </button>
                )}
              </div>
            </div>
          ))}
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>استكشف - Souq Pi</title>
        <script src="https://sdk.minepi.com/pi-sdk.js"></script>
        <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no" />
        <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap" rel="stylesheet" />
      </Head>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        body{background:#0a0118;color:#fff;font-family:'Cairo',sans-serif;direction:rtl;padding-bottom:100px;}
        .header{background:rgba(26,11,46,0.95);padding:12px 16px;border-bottom:1px solid #d4af37;position:sticky;top:0;z-index:100;}
        .search-row{display:flex;gap:8px;margin-top:10px;align-items:center;}
        .search-input{flex:1;background:#0a0118;border:1.5px solid #6a0dad;padding:11px 14px;border-radius:14px;color:#fff;font-family:'Cairo';font-size:0.9em;outline:none;}
        .filter-toggle{background:rgba(106,13,173,0.3);border:1.5px solid #6a0dad;color:#c084fc;padding:10px 14px;border-radius:14px;cursor:pointer;font-family:'Cairo';font-size:0.85em;white-space:nowrap;position:relative;}
        .filter-dot{position:absolute;top:6px;right:6px;width:8px;height:8px;background:#d4af37;border-radius:50%;}
        .filter-panel{background:#1a0b2e;border-bottom:1px solid #331a5e;padding:14px 16px;}
        .filter-label{font-size:0.72em;color:#b0b0b0;margin-bottom:4px;}
        .filter-row-inner{display:flex;gap:8px;}
        .mini-input{flex:1;background:#0a0118;border:1px solid #6a0dad;padding:9px 12px;border-radius:12px;color:#fff;font-family:'Cairo';font-size:0.85em;outline:none;}
        .sort-btns{display:flex;gap:6px;}
        .sort-btn{flex:1;background:rgba(255,255,255,0.05);border:1px solid #331a5e;color:#b0b0b0;padding:8px 4px;border-radius:10px;cursor:pointer;font-family:'Cairo';font-size:0.72em;}
        .sort-btn.active{background:rgba(106,13,173,0.3);border-color:#6a0dad;color:#c084fc;}
        .clear-btn{background:none;border:1px solid rgba(239,68,68,0.4);color:#ef4444;padding:7px 14px;border-radius:10px;cursor:pointer;font-family:'Cairo';font-size:0.75em;margin-top:10px;}
        .cat-row{display:flex;gap:8px;overflow-x:auto;padding:10px 16px;scrollbar-width:none;}
        .cat-row::-webkit-scrollbar{display:none;}
        .cat-btn{background:rgba(255,255,255,0.06);border:1px solid #331a5e;border-radius:20px;padding:6px 14px;color:#b0b0b0;cursor:pointer;font-family:'Cairo';font-size:0.8em;white-space:nowrap;}
        .cat-btn.active{background:rgba(106,13,173,0.4);border-color:#6a0dad;color:#fff;font-weight:700;}
        .results-bar{padding:6px 16px;font-size:0.72em;color:#b0b0b0;}
        .products{padding:12px;display:grid;grid-template-columns:1fr 1fr;gap:12px;}
        .pcard{background:#1a0b2e;border:1px solid #331a5e;border-radius:15px;overflow:hidden;display:flex;flex-direction:column;}
        .pimg-wrap{width:100%;height:110px;background:#0a0118;display:flex;align-items:center;justify-content:center;font-size:2.5em;overflow:hidden;}
        .pimg{width:100%;height:110px;object-fit:cover;display:block;}
        .pinfo{padding:10px;flex:1;display:flex;flex-direction:column;gap:3px;}
        .section-tag{font-size:0.6em;color:#c084fc;background:rgba(106,13,173,0.25);border-radius:6px;padding:2px 7px;display:inline-block;}
        .prod-name{font-size:0.78em;font-weight:700;line-height:1.3;height:36px;overflow:hidden;}
        .prod-price{color:#d4af37;font-weight:900;font-size:0.9em;}
        .prod-meta{display:flex;flex-wrap:wrap;gap:4px;margin-top:2px;}
        .meta-chip{font-size:0.6em;padding:2px 7px;border-radius:8px;font-weight:600;}
        .meta-brand{background:rgba(56,189,248,0.12);color:#38bdf8;border:1px solid rgba(56,189,248,0.25);}
        .meta-cond{background:rgba(34,197,94,0.12);color:#22c55e;border:1px solid rgba(34,197,94,0.25);}
        .meta-status-avail{background:rgba(34,197,94,0.12);color:#22c55e;border:1px solid rgba(34,197,94,0.25);}
        .meta-status-sold{background:rgba(239,68,68,0.12);color:#ef4444;border:1px solid rgba(239,68,68,0.25);}
        .meta-type{background:rgba(212,175,55,0.12);color:#d4af37;border:1px solid rgba(212,175,55,0.25);}
        .meta-loc{background:rgba(192,132,252,0.12);color:#c084fc;border:1px solid rgba(192,132,252,0.25);}
        .buybtn{background:linear-gradient(135deg,#6a0dad,#d4af37);color:#fff;border:none;padding:8px;border-radius:10px;width:100%;font-weight:700;cursor:pointer;font-family:'Cairo';margin-top:auto;}
        .buybtn:disabled{opacity:0.6;}
        .wa-btn{display:flex;align-items:center;justify-content:center;gap:5px;background:#25d366;color:#fff;border:none;padding:7px;border-radius:10px;width:100%;font-weight:700;cursor:pointer;font-family:'Cairo';font-size:0.75em;margin-top:5px;text-decoration:none;}
        .bottom-nav{position:fixed;bottom:0;left:0;right:0;background:#1a0b2e;display:flex;justify-content:space-around;padding:12px;border-top:1px solid #6a0dad;z-index:1000;}
        .nav-item{text-align:center;font-size:0.7em;cursor:pointer;color:#b0b0b0;flex:1;}
        .nav-item.active{color:#d4af37;}
        .toast{position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:#6a0dad;padding:10px 20px;border-radius:20px;z-index:2000;font-size:0.8em;}
        .empty-state{text-align:center;padding:50px 20px;color:#b0b0b0;}
        .cond-new{background:rgba(34,197,94,0.15);color:#22c55e;}
        .cond-used{background:rgba(234,179,8,0.15);color:#eab308;}
      `}</style>

      {/* ── Header & Search ── */}
      <div className="header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '1.1em' }}>🔍</span>
          <span style={{ fontWeight: 900 }}>استكشف المنتجات</span>
          {user && <span style={{ fontSize: '0.72em', color: '#d4af37', marginRight: 'auto' }}>@{user.username}</span>}
        </div>
        <div className="search-row">
          <input
            className="search-input"
            type="text"
            placeholder="ابحث بالاسم أو البائع أو الوصف..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <button className="filter-toggle" onClick={() => setShowFilters(f => !f)}>
            {activeFilterCount > 0 && <span className="filter-dot" />}
            ⚙️ فلاتر{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
          </button>
        </div>
      </div>

      {/* ── Filters Panel ── */}
      {showFilters && (
        <div className="filter-panel">
          {/* Seller username */}
          <div style={{ marginBottom: 10 }}>
            <div className="filter-label">🏪 اسم البائع (username)</div>
            <input className="mini-input" style={{ width: '100%' }} type="text" placeholder="مثال: ali_seller"
              value={sellerSearch} onChange={e => setSellerSearch(e.target.value)} />
          </div>

          {/* Price range */}
          <div style={{ marginBottom: 10 }}>
            <div className="filter-label">💰 نطاق السعر (Pi)</div>
            <div className="filter-row-inner">
              <input className="mini-input" type="number" placeholder="من" min="0" value={minPrice} onChange={e => setMinPrice(e.target.value)} />
              <input className="mini-input" type="number" placeholder="إلى" min="0" value={maxPrice} onChange={e => setMaxPrice(e.target.value)} />
            </div>
          </div>

          {/* Sort */}
          <div style={{ marginBottom: 10 }}>
            <div className="filter-label">📊 الترتيب</div>
            <div className="sort-btns">
              {[{ key: 'default', label: 'الافتراضي' }, { key: 'price_asc', label: 'السعر ↑' }, { key: 'price_desc', label: 'السعر ↓' }].map(s => (
                <button key={s.key} className={`sort-btn ${sortBy === s.key ? 'active' : ''}`} onClick={() => setSortBy(s.key)}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Per-category smart filters — only when a specific section is selected */}
          {activeSection !== 'all' && <SmartFilters section={activeSection} />}

          {activeFilterCount > 0 && (
            <button className="clear-btn" onClick={clearAllFilters}>✕ مسح جميع الفلاتر</button>
          )}
        </div>
      )}

      {/* ── Category Tabs ── */}
      <div className="cat-row">
        <button className={`cat-btn ${activeSection === 'all' ? 'active' : ''}`} onClick={() => setActiveSection('all')}>🌐 الكل</button>
        {SECTIONS.map(s => (
          <button
            key={s.key}
            className={`cat-btn ${activeSection === s.key ? 'active' : ''}`}
            onClick={() => { setActiveSection(s.key); if (!showFilters) setShowFilters(true); }}
          >
            {s.icon} {s.ar}
          </button>
        ))}
      </div>

      {/* ── Results count ── */}
      {!loading && (
        <div className="results-bar">
          {filtered.length} نتيجة{activeFilterCount > 0 ? ` (مفلترة من ${allProducts.filter(p => activeSection === 'all' || p._section === activeSection).length})` : ''}
        </div>
      )}

      {/* ── Products Grid ── */}
      {loading ? (
        <p style={{ textAlign: 'center', padding: 40, color: '#b0b0b0' }}>⏳ جاري تحميل المنتجات...</p>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div style={{ fontSize: '3em', marginBottom: 12 }}>🔍</div>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>لا توجد نتائج</div>
          <div style={{ fontSize: '0.82em', color: '#6a0dad' }}>جرّب تعديل الفلاتر</div>
          {activeFilterCount > 0 && (
            <button onClick={clearAllFilters} style={{ marginTop: 16, background: 'linear-gradient(135deg,#6a0dad,#d4af37)', border: 'none', color: '#fff', padding: '10px 24px', borderRadius: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Cairo' }}>
              مسح الفلاتر
            </button>
          )}
        </div>
      ) : (
        <div className="products">
          {filtered.map(r => {
            const f = r.fields;
            const isSold = f.status === 'Sold';
            return (
              <div key={r.id} className="pcard" style={{ opacity: isSold ? 0.75 : 1 }}>
                {/* Image */}
                <div className="pimg-wrap">
                  {f.image_url
                    ? <img className="pimg" src={f.image_url} alt={f.name} onError={e => { e.target.style.display = 'none'; }} />
                    : <span>{r._sectionIcon}</span>
                  }
                </div>

                <div className="pinfo">
                  <span className="section-tag">{r._sectionIcon} {r._sectionAr}</span>

                  <div className="prod-name">{f.name}</div>

                  <div className="prod-price">π {Number(f.price_pi).toFixed(2)}</div>

                  {/* Smart metadata chips per category */}
                  <div className="prod-meta">
                    {f.brand     && <span className="meta-chip meta-brand">🏷️ {f.brand}</span>}
                    {f.condition && (
                      <span className={`meta-chip ${f.condition === 'New' ? 'meta-cond' : 'cond-used'}`}>
                        {f.condition === 'New' ? '✨ جديد' : '🔄 مستعمل'}
                      </span>
                    )}
                    {f.type     && <span className="meta-chip meta-type">🏘️ {f.type === 'Villa' ? 'فيلا' : f.type === 'Apartment' ? 'شقة' : 'أرض'}</span>}
                    {f.location && <span className="meta-chip meta-loc">📍 {f.location}</span>}
                    {f.status && (
                      <span className={`meta-chip ${f.status === 'Available' ? 'meta-status-avail' : 'meta-status-sold'}`}>
                        {f.status === 'Available' ? '✅ متاح' : '🚫 مباع'}
                      </span>
                    )}
                  </div>

                  {f.seller_username && (
                    <div style={{ fontSize: '0.62em', color: '#b0b0b0' }}>🏪 @{f.seller_username}</div>
                  )}

                  <button
                    className="buybtn"
                    onClick={() => buyWithPi(r)}
                    disabled={paying === r.id || isSold}
                    style={{ marginTop: 8 }}
                  >
                    {isSold ? '🚫 مباع' : paying === r.id ? '⏳ جاري...' : '🛒 شراء بـ Pi'}
                  </button>

                  {f.whatsapp && (
                    <a
                      className="wa-btn"
                      href={`https://wa.me/${String(f.whatsapp).replace(/\D/g, '')}?text=${encodeURIComponent(`مرحباً، أريد الاستفسار عن "${f.name}" بسعر π ${f.price_pi}`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      💬 واتساب البائع
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="bottom-nav">
        <div className="nav-item" onClick={() => window.location.href = '/'}>🏠<br />الرئيسية</div>
        <div className="nav-item active">🔍<br />استكشف</div>
        <div className="nav-item" onClick={() => window.location.href = '/my-orders'}>📦<br />طلباتي</div>
        <div className="nav-item" onClick={() => window.location.href = '/become-seller'}>🏪<br />بيّع</div>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </>
  );

  function SmartFilters({ section }) {
    const config = CAT_FILTERS[section];
    if (!config) return null;
    return (
      <div style={{ borderTop: '1px solid #1e0a3c', paddingTop: 12, marginTop: 4 }}>
        <div style={{ fontSize: '0.72em', color: '#c084fc', fontWeight: 700, marginBottom: 10 }}>
          ✦ فلاتر {SECTIONS.find(s => s.key === section)?.icon} {SECTIONS.find(s => s.key === section)?.ar}
        </div>

        {/* Brand chips */}
        {config.brand && availableBrands.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div className="filter-label">الماركة</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {availableBrands.map(b => (
                <button key={b} onClick={() => setCatFilter('brand', b)} style={{
                  background: catFilters.brand === b ? 'rgba(106,13,173,0.5)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${catFilters.brand === b ? '#6a0dad' : '#331a5e'}`,
                  color: catFilters.brand === b ? '#fff' : '#b0b0b0',
                  padding: '5px 12px', borderRadius: 20, cursor: 'pointer',
                  fontFamily: 'Cairo', fontSize: '0.78em', fontWeight: catFilters.brand === b ? 700 : 400
                }}>{b}</button>
              ))}
              {catFilters.brand && (
                <button onClick={() => setCatFilter('brand', '')} style={{ background: 'none', border: '1px solid #ef444455', color: '#ef4444', padding: '5px 10px', borderRadius: 20, cursor: 'pointer', fontFamily: 'Cairo', fontSize: '0.75em' }}>✕</button>
              )}
            </div>
          </div>
        )}

        {/* Brand text input if no brands available */}
        {config.brand && availableBrands.length === 0 && !loading && (
          <div style={{ marginBottom: 10 }}>
            <div className="filter-label">الماركة</div>
            <input style={{ width: '100%', background: '#0a0118', border: '1px solid #6a0dad', padding: '9px 12px', borderRadius: 12, color: '#fff', fontFamily: 'Cairo', fontSize: '0.85em', outline: 'none' }}
              type="text" placeholder="أدخل الماركة..."
              value={catFilters.brand || ''}
              onChange={e => setCatFilters(prev => ({ ...prev, brand: e.target.value }))}
            />
          </div>
        )}

        {/* Location input (Real_Estate) */}
        {config.location && (
          <div style={{ marginBottom: 10 }}>
            <div className="filter-label">📍 الموقع</div>
            <input style={{ width: '100%', background: '#0a0118', border: '1px solid #6a0dad', padding: '9px 12px', borderRadius: 12, color: '#fff', fontFamily: 'Cairo', fontSize: '0.85em', outline: 'none' }}
              type="text" placeholder="مدينة أو منطقة..."
              value={catFilters.location || ''}
              onChange={e => setCatFilters(prev => ({ ...prev, location: e.target.value }))}
            />
          </div>
        )}

        {/* Select-type filters (condition, type, status) */}
        {Object.entries(config)
          .filter(([, cfg]) => cfg.type === 'select')
          .map(([key, cfg]) => (
            <div key={key} style={{ marginBottom: 10 }}>
              <div className="filter-label">{cfg.label}</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {cfg.opts.map(opt => (
                  <button key={opt} onClick={() => setCatFilter(key, opt)} style={{
                    background: catFilters[key] === opt ? 'rgba(106,13,173,0.5)' : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${catFilters[key] === opt ? '#6a0dad' : '#331a5e'}`,
                    color: catFilters[key] === opt ? '#fff' : '#b0b0b0',
                    padding: '6px 14px', borderRadius: 20, cursor: 'pointer',
                    fontFamily: 'Cairo', fontSize: '0.8em', fontWeight: catFilters[key] === opt ? 700 : 400
                  }}>
                    {cfg.arMap?.[opt] || opt}
                  </button>
                ))}
                {catFilters[key] && (
                  <button onClick={() => setCatFilter(key, '')} style={{ background: 'none', border: '1px solid #ef444455', color: '#ef4444', padding: '6px 10px', borderRadius: 20, cursor: 'pointer', fontFamily: 'Cairo', fontSize: '0.75em' }}>✕</button>
                )}
              </div>
            </div>
          ))}
      </div>
    );
  }
}
