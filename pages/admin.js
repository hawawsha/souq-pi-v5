import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';

const TABLE_LABELS = { Cars: 'سيارات 🚗', Electronics: 'إلكترونيات 📱', Electric: 'كهربائيات ⚡', Real_Estate: 'عقارات 🏠' };

export default function AdminPage() {
  const [authed, setAuthed]       = useState(false);
  const [keyInput, setKeyInput]   = useState('');
  const [tab, setTab]             = useState('dashboard');
  const [orders, setOrders]       = useState([]);
  const [refunds, setRefunds]     = useState([]);
  const [sellers, setSellers]     = useState([]);
  const [products, setProducts]   = useState([]);
  const [loading, setLoading]     = useState(false);
  const [acting, setActing]       = useState(null);
  const [deleting, setDeleting]   = useState(null);
  const [toast, setToast]         = useState('');
  const [search, setSearch]       = useState('');
  const [health, setHealth]       = useState(null); // null=checking, {ok,checks}
  const healthRef                 = useRef(null);
  const [analytics,        setAnalytics]        = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  const hdrs = () => ({ 'Content-Type': 'application/json', 'x-admin-key': keyInput.trim() });

  function showToast(msg, ok = false) {
    setToast({ msg, ok });
    setTimeout(() => setToast(''), 3500);
  }

  async function checkHealth() {
    try {
      const r = await fetch('/api/health');
      const d = await r.json();
      setHealth(d);
    } catch {
      setHealth({ ok: false, checks: { airtable: false, pi_key: false, error: 'تعذّر الوصول إلى السيرفر' } });
    }
  }

  useEffect(() => {
    checkHealth();
    healthRef.current = setInterval(checkHealth, 60000);
    return () => clearInterval(healthRef.current);
  }, []);

  async function login() {
    if (!keyInput.trim()) return;
    setLoading(true);
    try {
      const r = await fetch('/api/admin-sellers', { headers: { 'x-admin-key': keyInput.trim() } });
      if (r.status === 401) { showToast('مفتاح خاطئ ❌'); setLoading(false); return; }
      await loadAll(keyInput.trim());
      setAuthed(true);
    } catch { showToast('خطأ في الاتصال'); }
    setLoading(false);
  }

  async function loadAll(key) {
    const k = key || keyInput.trim();
    const h = { 'x-admin-key': k };
    const [sRes, rRes, oRes, pRes] = await Promise.all([
      fetch('/api/admin-sellers',  { headers: h }).then(r => r.json()),
      fetch('/api/refund?action=list').then(r => r.json()),
      fetch('/api/admin-orders',   { headers: h }).then(r => r.json()),
      fetch('/api/admin-products', { headers: h }).then(r => r.json()),
    ]);
    setSellers(sRes.records  || []);
    setRefunds(rRes.records  || []);
    setOrders(oRes.records   || []);
    setProducts(pRes.records || []);
  }

  async function sellerAction(record, action) {
    setActing(record.id);
    try {
      const r = await fetch('/api/admin-sellers', {
        method: 'POST', headers: hdrs(),
        body: JSON.stringify({ recordId: record.id, action, username: record.fields.username, shop_name: record.fields.shop_name })
      });
      const d = await r.json();
      if (d.success) { showToast(action === 'approve' ? '✅ تم قبول التاجر' : '❌ تم رفض الطلب', action === 'approve'); await loadAll(); }
      else showToast(d.error || 'خطأ');
    } catch { showToast('خطأ في الاتصال'); }
    setActing(null);
  }

  async function refundAction(record, action) {
    setActing(record.id);
    try {
      const r = await fetch('/api/refund', {
        method: 'POST', headers: hdrs(),
        body: JSON.stringify({ action: action === 'approve' ? 'approve' : 'reject', recordId: record.id })
      });
      const d = await r.json();
      if (r.ok) {
        showToast(action === 'approve' ? '✅ تم إرسال الاسترجاع عبر Pi' : '❌ تم رفض الاسترجاع', action === 'approve');
        await loadAll();
      } else showToast(d.error || 'فشل');
    } catch { showToast('خطأ'); }
    setActing(null);
  }

  async function updateOrderStatus(record, newStatus) {
    setActing(record.id);
    try {
      const r = await fetch('/api/admin-orders', {
        method: 'PATCH', headers: hdrs(),
        body: JSON.stringify({ recordId: record.id, delivery_status: newStatus })
      });
      const d = await r.json();
      if (d.success) {
        showToast('✅ تم تحديث حالة الطلب', true);
        setOrders(prev => prev.map(o => o.id === record.id
          ? { ...o, fields: { ...o.fields, delivery_status: newStatus } }
          : o
        ));
      } else {
        showToast(d.error || 'فشل التحديث');
      }
    } catch { showToast('خطأ في الاتصال'); }
    setActing(null);
  }

  async function deleteProduct(record) {
    if (!confirm(`حذف: "${record.fields.name}"؟`)) return;
    setDeleting(record.id);
    try {
      const r = await fetch('/api/admin-products', {
        method: 'DELETE', headers: hdrs(),
        body: JSON.stringify({ recordId: record.id, tableName: record._table })
      });
      const d = await r.json();
      if (d.success) { showToast('🗑️ تم حذف المنتج', true); setProducts(p => p.filter(x => x.id !== record.id)); }
      else showToast(d.error || 'فشل الحذف');
    } catch { showToast('خطأ'); }
    setDeleting(null);
  }

  async function loadAnalytics() {
    setAnalyticsLoading(true);
    try {
      const r = await fetch('/api/seller-analytics', { headers: { 'x-admin-key': keyInput.trim() } });
      const d = await r.json();
      if (r.ok) setAnalytics(d);
      else showToast(d.error || 'فشل جلب التحليلات');
    } catch { showToast('خطأ في الاتصال'); }
    setAnalyticsLoading(false);
  }

  // ── إحصاءات ───────────────────────────────────────────
  const totalPi       = orders.reduce((s, o) => s + (parseFloat(o.fields.amount_pi) || 0), 0);
  const pendingSellers = sellers.filter(r => r.fields.status === 'pending');
  const approvedSellers = sellers.filter(r => r.fields.status === 'approved');
  const rejectedSellers = sellers.filter(r => r.fields.status === 'rejected');
  const refundPending  = refunds.filter(r => r.fields.status === 'pending');
  const refundApproved = refunds.filter(r => r.fields.status === 'approved');
  const refundCompleted = refunds.filter(r => r.fields.status === 'completed');
  const refundRejected = refunds.filter(r => r.fields.status === 'rejected');

  const filteredOrders   = orders.filter(o =>
    !search || [o.fields.username, o.fields.product_name, o.fields.seller_username, o.fields.payment_id]
      .some(v => (v || '').toLowerCase().includes(search.toLowerCase())));
  const filteredProducts = products.filter(p =>
    !search || (p.fields.name || '').toLowerCase().includes(search.toLowerCase()));

  const TABS = [
    { key: 'dashboard',  label: '📊 نظرة عامة' },
    { key: 'orders',     label: `📦 الطلبات (${orders.length})` },
    { key: 'refunds',    label: `↩️ استرجاع${refundPending.length ? ` (${refundPending.length})` : ''}` },
    { key: 'sellers',    label: `🏪 تجار${pendingSellers.length ? ` (${pendingSellers.length})` : ''}` },
    { key: 'products',   label: `🛒 منتجات (${products.length})` },
    { key: 'analytics',  label: '📈 تحليلات التجار' },
  ];

  return (
    <>
      <Head>
        <title>لوحة التحكم — Souq Pi</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no" />
        <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap" rel="stylesheet" />
      </Head>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        body{background:#0a0118;color:#fff;font-family:'Cairo',sans-serif;direction:rtl;min-height:100vh;padding-bottom:40px;}
        .topbar{background:rgba(26,11,46,0.97);padding:12px 18px;border-bottom:2px solid #d4af37;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:200;}
        .logo{display:flex;align-items:center;gap:8px;font-weight:900;font-size:1em;}
        .logo-icon{width:34px;height:34px;background:linear-gradient(135deg,#6a0dad,#d4af37);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:1.1em;}
        .refresh-btn{background:rgba(212,175,55,0.15);border:1px solid #d4af37;color:#d4af37;padding:6px 14px;border-radius:8px;cursor:pointer;font-family:'Cairo';font-size:0.8em;}
        .login-wrap{display:flex;align-items:center;justify-content:center;min-height:80vh;padding:20px;}
        .login-box{background:#1a0b2e;border:1px solid #331a5e;border-radius:20px;padding:36px 28px;width:100%;max-width:360px;text-align:center;}
        .input{width:100%;background:#0a0118;border:1px solid #6a0dad;padding:13px;border-radius:12px;color:#fff;font-family:'Cairo';font-size:0.95em;outline:none;margin-bottom:12px;text-align:center;}
        .btn-primary{background:linear-gradient(135deg,#6a0dad,#d4af37);color:#fff;border:none;padding:13px;border-radius:12px;width:100%;font-weight:900;cursor:pointer;font-family:'Cairo';font-size:1em;}
        .btn-primary:disabled{opacity:0.6;cursor:not-allowed;}
        .tabs-row{display:flex;overflow-x:auto;border-bottom:1px solid #331a5e;background:rgba(26,11,46,0.6);scrollbar-width:none;position:sticky;top:57px;z-index:100;}
        .tabs-row::-webkit-scrollbar{display:none;}
        .tab-btn{flex-shrink:0;padding:11px 14px;background:none;border:none;color:#b0b0b0;font-family:'Cairo';font-size:0.8em;cursor:pointer;border-bottom:2px solid transparent;white-space:nowrap;}
        .tab-btn.active{color:#d4af37;border-bottom-color:#d4af37;font-weight:700;}
        .container{max-width:520px;margin:0 auto;padding:14px;}
        .stats-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:18px;}
        .stat-card{background:#1a0b2e;border:1px solid #331a5e;border-radius:14px;padding:14px;text-align:center;}
        .stat-num{font-size:1.9em;font-weight:900;line-height:1.1;}
        .stat-lbl{font-size:0.68em;color:#b0b0b0;margin-top:3px;}
        .section-lbl{font-size:0.82em;font-weight:700;color:#b0b0b0;margin:14px 0 8px;padding-right:2px;border-right:3px solid #6a0dad;padding-right:8px;}
        .card{background:#1a0b2e;border:1px solid #331a5e;border-radius:14px;padding:14px;margin-bottom:9px;}
        .card-row{display:flex;gap:10px;align-items:flex-start;}
        .avatar{width:38px;height:38px;border-radius:10px;background:linear-gradient(135deg,#6a0dad,#d4af37);display:flex;align-items:center;justify-content:center;font-weight:900;font-size:1.1em;flex-shrink:0;}
        .card-info{flex:1;min-width:0;}
        .card-title{font-weight:800;font-size:0.88em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .card-sub{font-size:0.75em;color:#b0b0b0;margin-top:2px;}
        .card-pi{font-size:0.82em;color:#d4af37;font-weight:900;margin-top:2px;}
        .card-id{font-size:0.62em;color:#6a0dad;margin-top:2px;direction:ltr;text-align:right;}
        .actions{display:flex;gap:8px;margin-top:10px;}
        .btn-ok{flex:1;background:rgba(34,197,94,0.15);border:1px solid #22c55e;color:#22c55e;padding:9px;border-radius:10px;font-family:'Cairo';font-size:0.82em;cursor:pointer;font-weight:700;}
        .btn-no{flex:1;background:rgba(239,68,68,0.15);border:1px solid #ef4444;color:#ef4444;padding:9px;border-radius:10px;font-family:'Cairo';font-size:0.82em;cursor:pointer;font-weight:700;}
        .btn-ok:disabled,.btn-no:disabled{opacity:0.4;cursor:not-allowed;}
        .badge{display:inline-block;font-size:0.65em;padding:2px 9px;border-radius:10px;font-weight:700;margin-top:3px;}
        .badge-pending{background:rgba(234,179,8,0.15);color:#eab308;border:1px solid #eab308;}
        .badge-approved,.badge-completed{background:rgba(34,197,94,0.15);color:#22c55e;border:1px solid #22c55e;}
        .badge-rejected{background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid #ef4444;}
        .search-box{width:100%;background:#0a0118;border:1.5px solid #6a0dad;padding:10px 14px;border-radius:12px;color:#fff;font-family:'Cairo';font-size:0.88em;outline:none;margin-bottom:12px;}
        .prod-img{width:44px;height:44px;border-radius:8px;object-fit:cover;background:#0a0118;flex-shrink:0;}
        .btn-del{background:rgba(239,68,68,0.12);border:1px solid #ef4444;color:#ef4444;padding:5px 12px;border-radius:8px;font-family:'Cairo';font-size:0.72em;cursor:pointer;margin-top:6px;}
        .btn-del:disabled{opacity:0.4;cursor:not-allowed;}
        .empty{text-align:center;padding:28px;color:#b0b0b0;font-size:0.85em;}
        .wa-link{display:inline-flex;align-items:center;gap:4px;background:rgba(37,211,102,0.12);border:1px solid #25d366;color:#25d366;padding:4px 10px;border-radius:8px;font-size:0.72em;text-decoration:none;font-weight:700;margin-top:4px;}
        .toast-wrap{position:fixed;bottom:28px;left:50%;transform:translateX(-50%);z-index:3000;}
        .toast{background:#1a0b2e;border:1px solid;padding:10px 22px;border-radius:20px;font-size:0.85em;white-space:nowrap;}
        .activity-row{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #1a0b2e;}
        .activity-icon{width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:1em;flex-shrink:0;}
        .health-banner{padding:10px 18px;font-size:0.8em;display:flex;align-items:flex-start;gap:10px;line-height:1.5;}
        .health-banner.error{background:rgba(239,68,68,0.12);border-bottom:1px solid rgba(239,68,68,0.4);color:#fca5a5;}
        .health-banner.warn{background:rgba(234,179,8,0.1);border-bottom:1px solid rgba(234,179,8,0.3);color:#fde68a;}
        .health-banner.ok{background:rgba(34,197,94,0.08);border-bottom:1px solid rgba(34,197,94,0.25);color:#86efac;}
        .health-banner.checking{background:rgba(255,255,255,0.04);border-bottom:1px solid rgba(255,255,255,0.08);color:#b0b0b0;}
        .health-icon{font-size:1.2em;flex-shrink:0;margin-top:1px;}
        .health-text{flex:1;}
        .health-link{color:#d4af37;text-decoration:underline;font-weight:700;cursor:pointer;}
        .health-indicators{display:flex;gap:8px;margin-top:6px;flex-wrap:wrap;}
        .h-dot{display:inline-flex;align-items:center;gap:4px;font-size:0.85em;padding:2px 8px;border-radius:10px;}
        .h-dot.on{background:rgba(34,197,94,0.15);color:#22c55e;border:1px solid rgba(34,197,94,0.3);}
        .h-dot.off{background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid rgba(239,68,68,0.3);}
        .h-recheck{background:none;border:1px solid rgba(255,255,255,0.15);color:#b0b0b0;padding:3px 10px;border-radius:8px;cursor:pointer;font-family:'Cairo';font-size:0.85em;margin-top:6px;}
      `}</style>

      <div className="topbar">
        <div className="logo">
          <div className="logo-icon">π</div>
          <span>لوحة التحكم</span>
        </div>
        {authed && (
          <button className="refresh-btn" onClick={() => loadAll()}>↻ تحديث</button>
        )}
      </div>

      {/* ── Health Banner ── */}
      {health === null && (
        <div className="health-banner checking">
          <span className="health-icon">⏳</span>
          <span className="health-text">جاري فحص حالة الاتصال...</span>
        </div>
      )}
      {health !== null && !health.ok && (
        <div className="health-banner error">
          <span className="health-icon">🔴</span>
          <div className="health-text">
            <strong>تحذير: اتصال Airtable منقطع</strong><br />
            {health.checks?.error && (
              <span>{health.checks.error}</span>
            )}
            {health.checks?.airtable_status === 401 && (
              <span> — <a className="health-link" href="https://airtable.com/create/tokens" target="_blank" rel="noopener noreferrer">انقر هنا لتجديد AIRTABLE_TOKEN</a></span>
            )}
            <div className="health-indicators">
              <span className={`h-dot ${health.checks?.airtable ? 'on' : 'off'}`}>
                {health.checks?.airtable ? '✓' : '✗'} Airtable
              </span>
              <span className={`h-dot ${health.checks?.pi_key ? 'on' : 'off'}`}>
                {health.checks?.pi_key ? '✓' : '✗'} Pi API Key
              </span>
            </div>
            <button className="h-recheck" onClick={checkHealth}>↻ إعادة الفحص</button>
          </div>
        </div>
      )}
      {health !== null && health.ok && (
        <div className="health-banner ok">
          <span className="health-icon">🟢</span>
          <div className="health-text">
            جميع الاتصالات تعمل
            <div className="health-indicators">
              <span className="h-dot on">✓ Airtable</span>
              <span className="h-dot on">✓ Pi API Key</span>
            </div>
          </div>
        </div>
      )}

      {!authed ? (
        <div className="login-wrap">
          <div className="login-box">
            <div style={{ fontSize: '2.8em', marginBottom: 10 }}>🔐</div>
            <div style={{ fontWeight: 900, fontSize: '1.1em', marginBottom: 4 }}>دخول الأدمن</div>
            <div style={{ fontSize: '0.78em', color: '#b0b0b0', marginBottom: 22 }}>أدخل مفتاح الأدمن السري للدخول</div>
            <input
              className="input" type="password"
              placeholder="ADMIN_SECRET_KEY"
              value={keyInput}
              onChange={e => setKeyInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && login()}
            />
            <button className="btn-primary" onClick={login} disabled={loading}>
              {loading ? 'جاري التحقق...' : '🔓 دخول'}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="tabs-row">
            {TABS.map(t => (
              <button key={t.key} className={`tab-btn ${tab === t.key ? 'active' : ''}`} onClick={() => { setTab(t.key); setSearch(''); }}>
                {t.label}
              </button>
            ))}
          </div>

          <div className="container">

            {/* ━━━━━━━━━ 1. DASHBOARD ━━━━━━━━━ */}
            {tab === 'dashboard' && (
              <>
                <div className="stats-grid">
                  <div className="stat-card">
                    <div className="stat-num" style={{ color: '#d4af37' }}>{orders.length}</div>
                    <div className="stat-lbl">إجمالي الطلبات</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-num" style={{ color: '#c084fc' }}>π {totalPi.toFixed(1)}</div>
                    <div className="stat-lbl">Pi محوّلة</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-num" style={{ color: '#22c55e' }}>{approvedSellers.length}</div>
                    <div className="stat-lbl">تجار نشطون</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-num" style={{ color: '#ef4444' }}>{refundPending.length}</div>
                    <div className="stat-lbl">استرجاعات معلقة</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-num" style={{ color: '#eab308' }}>{pendingSellers.length}</div>
                    <div className="stat-lbl">طلبات تجار جديدة</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-num" style={{ color: '#38bdf8' }}>{products.length}</div>
                    <div className="stat-lbl">إجمالي المنتجات</div>
                  </div>
                </div>

                <div className="section-lbl">آخر 5 طلبات</div>
                {orders.slice(0, 5).map(o => (
                  <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#1a0b2e', borderRadius: 12, padding: '10px 12px', marginBottom: 8 }}>
                    <div className="activity-icon" style={{ background: 'rgba(106,13,173,0.3)' }}>🛒</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.82em', fontWeight: 700 }}>{o.fields.product_name || '—'}</div>
                      <div style={{ fontSize: '0.72em', color: '#b0b0b0' }}>@{o.fields.username} ← @{o.fields.seller_username || '؟'}</div>
                    </div>
                    <div style={{ fontSize: '0.82em', color: '#d4af37', fontWeight: 900 }}>π {o.fields.amount_pi}</div>
                  </div>
                ))}
                {orders.length === 0 && <div className="empty">لا توجد طلبات بعد</div>}
              </>
            )}

            {/* ━━━━━━━━━ 2. ORDERS ━━━━━━━━━ */}
            {tab === 'orders' && (
              <>
                <input className="search-box" placeholder="🔍 بحث في الطلبات..." value={search} onChange={e => setSearch(e.target.value)} />
                {filteredOrders.length === 0
                  ? <div className="empty">لا توجد طلبات</div>
                  : filteredOrders.map(o => {
                    const ds = o.fields.delivery_status || 'pending';
                    const STATUS_STYLES = {
                      pending:   { color: '#eab308', label: '⏳ قيد المعالجة' },
                      shipped:   { color: '#38bdf8', label: '🚚 تم الشحن'    },
                      delivered: { color: '#22c55e', label: '✅ تم التسليم'   },
                      cancelled: { color: '#ef4444', label: '🚫 ملغي'        },
                    };
                    const style = STATUS_STYLES[ds] || STATUS_STYLES.pending;
                    return (
                      <div key={o.id} className="card">
                        <div className="card-row">
                          <div className="avatar" style={{ background: 'rgba(106,13,173,0.4)', fontSize: '1.3em' }}>🛒</div>
                          <div className="card-info">
                            <div className="card-title">{o.fields.product_name || '(بدون اسم)'}</div>
                            <div className="card-pi">π {o.fields.amount_pi}</div>
                            <div className="card-sub">المشتري: @{o.fields.username}</div>
                            <div className="card-sub">البائع: @{o.fields.seller_username || '—'}</div>
                            <div className="card-sub">الجدول: {TABLE_LABELS[o.fields.table_name] || o.fields.table_name || '—'}</div>
                            <div className="card-id">Payment: {o.fields.payment_id?.slice(0, 18)}…</div>
                            {o.fields.txid && <div className="card-id">TX: {o.fields.txid?.slice(0, 18)}…</div>}
                            <span className="badge" style={{ background: `${style.color}22`, color: style.color, border: `1px solid ${style.color}`, marginTop: 4 }}>
                              {style.label}
                            </span>
                          </div>
                        </div>
                        {/* Status Update */}
                        <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                          {['pending','shipped','delivered','cancelled'].map(s => (
                            <button
                              key={s}
                              disabled={acting === o.id || ds === s}
                              onClick={() => updateOrderStatus(o, s)}
                              style={{
                                flex: 1, minWidth: 70, padding: '6px 4px', borderRadius: 9,
                                fontFamily: 'Cairo', fontSize: '0.7em', fontWeight: 700, cursor: ds === s ? 'default' : 'pointer',
                                background: ds === s ? `${STATUS_STYLES[s].color}25` : 'rgba(255,255,255,0.04)',
                                border: `1px solid ${ds === s ? STATUS_STYLES[s].color : '#331a5e'}`,
                                color: ds === s ? STATUS_STYLES[s].color : '#b0b0b0',
                                opacity: acting === o.id && ds !== s ? 0.5 : 1
                              }}
                            >
                              {acting === o.id && ds !== s ? '...' : STATUS_STYLES[s].label}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
              </>
            )}

            {/* ━━━━━━━━━ 3. REFUNDS ━━━━━━━━━ */}
            {tab === 'refunds' && (
              <>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  {[['معلقة', refundPending.length, '#eab308'], ['مقبولة', refundApproved.length + refundCompleted.length, '#22c55e'], ['مرفوضة', refundRejected.length, '#ef4444']].map(([l, n, c]) => (
                    <div key={l} className="stat-card" style={{ flex: 1 }}>
                      <div className="stat-num" style={{ color: c, fontSize: '1.5em' }}>{n}</div>
                      <div className="stat-lbl">{l}</div>
                    </div>
                  ))}
                </div>

                <div className="section-lbl">⏳ معلقة ({refundPending.length})</div>
                {refundPending.length === 0 && <div className="empty">لا توجد طلبات استرجاع معلقة</div>}
                {refundPending.map(r => (
                  <div key={r.id} className="card">
                    <div className="card-row">
                      <div className="avatar" style={{ background: 'rgba(234,179,8,0.2)', fontSize: '1.3em' }}>↩️</div>
                      <div className="card-info">
                        <div className="card-title">{r.fields.product_name || '(بدون اسم)'}</div>
                        <div className="card-pi">π {r.fields.amount_pi}</div>
                        <div className="card-sub">المشتري: @{r.fields.buyer_username}</div>
                        <div className="card-id">Payment: {r.fields.payment_id?.slice(0, 18)}…</div>
                        {r.fields.buyer_uid && <div className="card-id">UID: {r.fields.buyer_uid?.slice(0, 18)}…</div>}
                      </div>
                    </div>
                    <div className="actions">
                      <button className="btn-ok" onClick={() => refundAction(r, 'approve')} disabled={acting === r.id}>
                        {acting === r.id ? '...' : '✅ موافقة + إرسال Pi'}
                      </button>
                      <button className="btn-no" onClick={() => refundAction(r, 'reject')} disabled={acting === r.id}>
                        {acting === r.id ? '...' : '❌ رفض'}
                      </button>
                    </div>
                  </div>
                ))}

                <div className="section-lbl">✅ مقبولة ومكتملة ({refundApproved.length + refundCompleted.length})</div>
                {[...refundApproved, ...refundCompleted].map(r => (
                  <div key={r.id} className="card">
                    <div className="card-row">
                      <div className="avatar" style={{ background: 'rgba(34,197,94,0.2)', fontSize: '1.3em' }}>✅</div>
                      <div className="card-info">
                        <div className="card-title">{r.fields.product_name}</div>
                        <div className="card-pi">π {r.fields.amount_pi}</div>
                        <div className="card-sub">@{r.fields.buyer_username}</div>
                        <span className={`badge badge-${r.fields.status}`}>{r.fields.status === 'completed' ? 'مكتمل' : 'مقبول'}</span>
                        {r.fields.refund_payment_id && <div className="card-id">Refund ID: {r.fields.refund_payment_id?.slice(0, 16)}…</div>}
                      </div>
                    </div>
                  </div>
                ))}

                <div className="section-lbl">❌ مرفوضة ({refundRejected.length})</div>
                {refundRejected.map(r => (
                  <div key={r.id} className="card">
                    <div className="card-row">
                      <div className="avatar" style={{ background: 'rgba(239,68,68,0.2)', fontSize: '1.3em' }}>🚫</div>
                      <div className="card-info">
                        <div className="card-title">{r.fields.product_name}</div>
                        <div className="card-pi">π {r.fields.amount_pi}</div>
                        <div className="card-sub">@{r.fields.buyer_username}</div>
                        <span className="badge badge-rejected">مرفوض</span>
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}

            {/* ━━━━━━━━━ 4. SELLERS ━━━━━━━━━ */}
            {tab === 'sellers' && (
              <>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  {[['انتظار', pendingSellers.length, '#eab308'], ['مقبول', approvedSellers.length, '#22c55e'], ['مرفوض', rejectedSellers.length, '#ef4444']].map(([l, n, c]) => (
                    <div key={l} className="stat-card" style={{ flex: 1 }}>
                      <div className="stat-num" style={{ color: c, fontSize: '1.5em' }}>{n}</div>
                      <div className="stat-lbl">{l}</div>
                    </div>
                  ))}
                </div>

                <div className="section-lbl">⏳ قيد الانتظار ({pendingSellers.length})</div>
                {pendingSellers.length === 0 && <div className="empty">لا توجد طلبات جديدة</div>}
                {pendingSellers.map(r => (
                  <div key={r.id} className="card">
                    <div className="card-row">
                      <div className="avatar">{(r.fields.username?.[0] || '؟').toUpperCase()}</div>
                      <div className="card-info">
                        <div className="card-title">@{r.fields.username}</div>
                        <div className="card-sub">🏪 {r.fields.shop_name}</div>
                        {r.fields.whatsapp && (
                          <a className="wa-link" href={`https://wa.me/${String(r.fields.whatsapp).replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer">
                            💬 {r.fields.whatsapp}
                          </a>
                        )}
                      </div>
                    </div>
                    <div className="actions">
                      <button className="btn-ok" onClick={() => sellerAction(r, 'approve')} disabled={acting === r.id}>
                        {acting === r.id ? '...' : '✅ قبول'}
                      </button>
                      <button className="btn-no" onClick={() => sellerAction(r, 'reject')} disabled={acting === r.id}>
                        {acting === r.id ? '...' : '❌ رفض'}
                      </button>
                    </div>
                  </div>
                ))}

                <div className="section-lbl">✅ المقبولون ({approvedSellers.length})</div>
                {approvedSellers.length === 0 && <div className="empty">لا يوجد تجار مقبولون بعد</div>}
                {approvedSellers.map(r => (
                  <div key={r.id} className="card">
                    <div className="card-row">
                      <div className="avatar" style={{ background: 'linear-gradient(135deg,#16a34a,#22c55e)' }}>
                        {(r.fields.username?.[0] || '؟').toUpperCase()}
                      </div>
                      <div className="card-info">
                        <div className="card-title">@{r.fields.username}</div>
                        <div className="card-sub">🏪 {r.fields.shop_name}</div>
                        <span className="badge badge-approved">مقبول</span>
                        {r.fields.whatsapp && (
                          <a className="wa-link" href={`https://wa.me/${String(r.fields.whatsapp).replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer">
                            💬 واتساب
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                <div className="section-lbl">❌ المرفوضون ({rejectedSellers.length})</div>
                {rejectedSellers.map(r => (
                  <div key={r.id} className="card">
                    <div className="card-row">
                      <div className="avatar" style={{ background: 'linear-gradient(135deg,#dc2626,#ef4444)' }}>
                        {(r.fields.username?.[0] || '؟').toUpperCase()}
                      </div>
                      <div className="card-info">
                        <div className="card-title">@{r.fields.username}</div>
                        <div className="card-sub">{r.fields.shop_name}</div>
                        <span className="badge badge-rejected">مرفوض</span>
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}

            {/* ━━━━━━━━━ 5. PRODUCTS ━━━━━━━━━ */}
            {tab === 'products' && (
              <>
                <input className="search-box" placeholder="🔍 بحث في المنتجات..." value={search} onChange={e => setSearch(e.target.value)} />
                <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                  {Object.entries(TABLE_LABELS).map(([k, v]) => {
                    const count = products.filter(p => p._table === k).length;
                    return <span key={k} style={{ background: 'rgba(106,13,173,0.2)', border: '1px solid #6a0dad', borderRadius: 20, padding: '3px 12px', fontSize: '0.72em', color: '#c084fc' }}>{v} ({count})</span>;
                  })}
                </div>
                {filteredProducts.length === 0
                  ? <div className="empty">لا توجد منتجات</div>
                  : filteredProducts.map(p => (
                  <div key={p.id} className="card">
                    <div className="card-row">
                      {p.fields.image_url
                        ? <img className="prod-img" src={p.fields.image_url} alt="" />
                        : <div className="prod-img" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4em' }}>📦</div>}
                      <div className="card-info">
                        <div className="card-title">{p.fields.name}</div>
                        <div className="card-pi">π {p.fields.price_pi}</div>
                        <div className="card-sub">البائع: @{p.fields.seller_username || '—'}</div>
                        <div className="card-sub">{TABLE_LABELS[p._table] || p._table}</div>
                        <button className="btn-del" onClick={() => deleteProduct(p)} disabled={deleting === p.id}>
                          {deleting === p.id ? 'جاري الحذف...' : '🗑️ حذف المنتج'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}

            {/* ━━━━━━━━━ 6. ANALYTICS ━━━━━━━━━ */}
            {tab === 'analytics' && (
              <>
                {!analytics && !analyticsLoading && (
                  <div style={{ textAlign: 'center', padding: '30px 0' }}>
                    <div style={{ fontSize: '2.5em', marginBottom: 12 }}>📈</div>
                    <div style={{ color: '#b0b0b0', marginBottom: 20, fontSize: '0.9em' }}>اضغط لتحميل تحليلات التجار</div>
                    <button className="btn-primary" onClick={loadAnalytics} style={{ width: 'auto', padding: '12px 32px' }}>
                      تحميل التحليلات
                    </button>
                  </div>
                )}

                {analyticsLoading && (
                  <div style={{ textAlign: 'center', padding: 40, color: '#b0b0b0' }}>
                    <div style={{ fontSize: '1.5em', marginBottom: 8 }}>⏳</div>
                    جاري تحليل البيانات...
                  </div>
                )}

                {analytics && !analyticsLoading && (() => {
                  const s = analytics.summary;
                  return (
                    <>
                      {/* ── Refresh button ── */}
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
                        <button onClick={loadAnalytics} className="refresh-btn">↻ تحديث التحليلات</button>
                      </div>

                      {/* ── Platform Summary Cards ── */}
                      <div className="stats-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 18 }}>
                        {[
                          { num: s.activeSellers,    lbl: 'تجار نشطون',       color: '#22c55e' },
                          { num: `π ${s.totalPi.toFixed(1)}`, lbl: 'إجمالي Pi',  color: '#d4af37' },
                          { num: s.totalOrders,      lbl: 'إجمالي الطلبات',    color: '#c084fc' },
                          { num: s.deliveredOrders,  lbl: 'طلبات مسلّمة',      color: '#38bdf8' },
                          { num: s.totalRatings,     lbl: 'تقييمات',           color: '#f97316' },
                          { num: s.overallAvgRating > 0 ? `${s.overallAvgRating} ★` : '—', lbl: 'متوسط التقييم', color: '#eab308' },
                        ].map((c, i) => (
                          <div key={i} className="stat-card">
                            <div className="stat-num" style={{ color: c.color, fontSize: '1.4em' }}>{c.num}</div>
                            <div className="stat-lbl">{c.lbl}</div>
                          </div>
                        ))}
                      </div>

                      {/* ── Per-Seller Cards ── */}
                      <div className="section-lbl">ترتيب التجار حسب Pi المحقّقة</div>
                      {analytics.sellers.length === 0 && (
                        <div className="empty">لا يوجد تجار معتمدون بعد</div>
                      )}
                      {analytics.sellers.map((sel, idx) => {
                        const stars = Math.round(sel.avgRating);
                        const noOrders = sel.totalOrders === 0;
                        return (
                          <div key={sel.username} className="card" style={{ opacity: noOrders ? 0.6 : 1 }}>
                            {/* Header row */}
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                              <div style={{
                                width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                                background: `linear-gradient(135deg,#6a0dad,#d4af37)`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontWeight: 900, fontSize: '1em', color: '#fff'
                              }}>
                                {idx + 1}
                              </div>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 800, fontSize: '0.92em' }}>{sel.shopName}</div>
                                <div style={{ fontSize: '0.72em', color: '#b0b0b0' }}>@{sel.username}</div>
                                {sel.ratingCount > 0 && (
                                  <div style={{ fontSize: '0.75em', color: '#eab308', marginTop: 2 }}>
                                    {'★'.repeat(stars)}{'☆'.repeat(5 - stars)} {sel.avgRating} ({sel.ratingCount} تقييم)
                                  </div>
                                )}
                              </div>
                              <div style={{ textAlign: 'left' }}>
                                <div style={{ color: '#d4af37', fontWeight: 900, fontSize: '1em' }}>π {sel.totalPi.toFixed(2)}</div>
                                <div style={{ fontSize: '0.68em', color: '#b0b0b0' }}>{sel.totalOrders} طلب</div>
                              </div>
                            </div>

                            {!noOrders && (
                              <>
                                {/* Stats row */}
                                <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
                                  {[
                                    { label: `✅ ${sel.delivered} مسلّم`,  color: '#22c55e' },
                                    { label: `🚚 ${sel.shipped} شحن`,     color: '#38bdf8' },
                                    { label: `⏳ ${sel.pending} معلق`,    color: '#eab308' },
                                    { label: `🚫 ${sel.cancelled} ملغي`,  color: '#ef4444' },
                                  ].map((b, i) => (
                                    <span key={i} style={{
                                      background: `${b.color}18`, border: `1px solid ${b.color}55`,
                                      color: b.color, padding: '3px 9px', borderRadius: 8,
                                      fontSize: '0.68em', fontWeight: 700
                                    }}>{b.label}</span>
                                  ))}
                                </div>

                                {/* Delivery % bar */}
                                <div style={{ marginTop: 10 }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7em', color: '#b0b0b0', marginBottom: 4 }}>
                                    <span>نسبة التسليم</span>
                                    <span style={{ color: sel.deliveryPct >= 70 ? '#22c55e' : '#eab308', fontWeight: 700 }}>{sel.deliveryPct}%</span>
                                  </div>
                                  <div style={{ background: '#0a0118', borderRadius: 6, height: 6, overflow: 'hidden' }}>
                                    <div style={{
                                      width: `${sel.deliveryPct}%`, height: '100%', borderRadius: 6,
                                      background: sel.deliveryPct >= 70 ? '#22c55e' : sel.deliveryPct >= 40 ? '#eab308' : '#ef4444',
                                      transition: 'width 0.6s ease'
                                    }} />
                                  </div>
                                </div>

                                {/* Top product + last order */}
                                <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                                  <div style={{ flex: 1, background: 'rgba(106,13,173,0.15)', borderRadius: 10, padding: '8px 10px' }}>
                                    <div style={{ fontSize: '0.65em', color: '#b0b0b0', marginBottom: 3 }}>المنتج الأكثر مبيعاً</div>
                                    <div style={{ fontSize: '0.78em', fontWeight: 700, color: '#c084fc' }}>{sel.topProduct}</div>
                                    <div style={{ fontSize: '0.65em', color: '#b0b0b0' }}>{sel.topProductCount} مبيعة</div>
                                  </div>
                                  <div style={{ flex: 1, background: 'rgba(212,175,55,0.08)', borderRadius: 10, padding: '8px 10px' }}>
                                    <div style={{ fontSize: '0.65em', color: '#b0b0b0', marginBottom: 3 }}>آخر طلب</div>
                                    <div style={{ fontSize: '0.78em', fontWeight: 700, color: '#d4af37' }}>{sel.lastOrderDate}</div>
                                  </div>
                                </div>

                                {/* WhatsApp */}
                                {sel.whatsapp && (
                                  <a
                                    href={`https://wa.me/${sel.whatsapp.replace(/\D/g,'')}?text=${encodeURIComponent(`مرحباً ${sel.shopName}، لديك تحديث من لوحة تحكم Souq Pi`)}`}
                                    target="_blank" rel="noopener noreferrer"
                                    className="wa-link" style={{ marginTop: 10, display: 'inline-flex' }}
                                  >
                                    📱 واتساب
                                  </a>
                                )}
                              </>
                            )}
                            {noOrders && (
                              <div style={{ fontSize: '0.75em', color: '#b0b0b0', marginTop: 8, textAlign: 'center' }}>
                                لا توجد مبيعات بعد
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </>
                  );
                })()}
              </>
            )}

          </div>
        </>
      )}

      {toast && (
        <div className="toast-wrap">
          <div className="toast" style={{ borderColor: toast.ok ? '#22c55e' : '#6a0dad', color: toast.ok ? '#22c55e' : '#fff' }}>
            {toast.msg}
          </div>
        </div>
      )}
    </>
  );
}
