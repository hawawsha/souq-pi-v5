import { useState, useEffect } from 'react';
import Head from 'next/head';

const TABLES = [
  { key: 'Cars',        ar: 'سيارات',    icon: '🚗' },
  { key: 'Electronics', ar: 'إلكترونيات', icon: '📱' },
  { key: 'Electric',   ar: 'كهربائيات', icon: '⚡' },
  { key: 'Real_Estate', ar: 'عقارات',    icon: '🏠' },
];

const DELIVERY_STATUS = {
  pending:   { label: '⏳ معلق',       color: '#eab308' },
  shipped:   { label: '🚚 تم الشحن',   color: '#38bdf8' },
  delivered: { label: '✅ مسلّم',       color: '#22c55e' },
  cancelled: { label: '🚫 ملغي',       color: '#ef4444' },
};

function buildBuyerWaMessage(order) {
  const f = order.fields;
  const phone = String(f.buyer_wallet || '').replace(/\D/g, '');
  const msg = encodeURIComponent(
    `مرحباً @${f.username || 'العميل'}،\n\nشكراً لطلبك "${f.product_name}" عبر Souq Pi.\nرقم الدفع: ${f.payment_id || ''}\nالمبلغ: π ${f.amount_pi || ''}\n\nهل لديك أي استفسار؟`
  );
  return { phone, msg };
}

export default function SellerDashboard() {
  const [user,          setUser]          = useState(null);
  const [tab,           setTab]           = useState('overview');
  const [products,      setProducts]      = useState([]);
  const [orders,        setOrders]        = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading,       setLoading]       = useState(false);
  const [toast,         setToast]         = useState('');
  const [deleting,      setDeleting]      = useState(null);
  const [showAddForm,   setShowAddForm]   = useState(false);
  const [addTable,      setAddTable]      = useState('Electronics');
  const [addForm,       setAddForm]       = useState({ name: '', price_pi: '', description: '', image_url: '' });
  const [imgPreview,    setImgPreview]    = useState('');
  const [adding,        setAdding]        = useState(false);
  const [isSeller,      setIsSeller]      = useState(false);

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3500); }

  useEffect(() => {
    const init = async () => {
      if (typeof window !== 'undefined' && window.Pi) {
        await window.Pi.init({ version: '2.0', sandbox: false });
      } else { setTimeout(init, 500); }
    };
    init();
  }, []);

  async function loginWithPi() {
    try {
      if (!window.Pi) { showToast('يرجى الفتح من متصفح Pi'); return; }
      const auth = await window.Pi.authenticate(['username', 'payments'], {
        onIncompletePaymentFound: async (p) => {
          try {
            await fetch('/api/payment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'approve', paymentId: p.identifier }) });
            await fetch('/api/payment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'complete', paymentId: p.identifier, txid: p.transaction?.txid || '' }) });
          } catch(e) {}
        }
      });
      setUser(auth.user);
      await checkSeller(auth.user.username);
    } catch(e) { showToast('فشل تسجيل الدخول'); }
  }

  async function checkSeller(username) {
    setLoading(true);
    try {
      const res  = await fetch(`/api/seller-request?username=${encodeURIComponent(username)}`);
      const data = await res.json();
      if (!res.ok) { showToast('خطأ في التحقق'); setIsSeller(false); }
      else if (data.isSeller) {
        setIsSeller(true);
        await Promise.all([
          loadProducts(username),
          loadOrders(username),
          loadNotifications(username)
        ]);
      } else { setIsSeller(false); }
    } catch(e) { showToast('خطأ في الاتصال'); }
    setLoading(false);
  }

  async function loadProducts(username) {
    try {
      const res  = await fetch(`/api/seller-products?username=${encodeURIComponent(username)}`);
      const data = await res.json();
      setProducts(data.records || []);
    } catch(e) { showToast('خطأ في تحميل المنتجات'); }
  }

  async function loadOrders(username) {
    try {
      const res  = await fetch(`/api/seller-orders?seller_username=${encodeURIComponent(username)}`);
      const data = await res.json();
      setOrders(data.records || []);
    } catch(e) { showToast('خطأ في تحميل الطلبات'); }
  }

  async function loadNotifications(username) {
    try {
      const res  = await fetch(`/api/notifications?seller_username=${encodeURIComponent(username)}`);
      const data = await res.json();
      setNotifications(data.records || []);
    } catch(e) { showToast('خطأ في تحميل التنبيهات'); }
  }

  async function markRead(recordId) {
    try {
      await fetch('/api/notifications', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordId })
      });
      setNotifications(n => n.map(x => x.id === recordId ? { ...x, fields: { ...x.fields, is_read: true } } : x));
    } catch(e) {}
  }

  async function deleteProduct(product) {
    if (!confirm('هل أنت متأكد من حذف هذا المنتج؟')) return;
    setDeleting(product.id);
    try {
      const res  = await fetch('/api/seller-products', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user.username, recordId: product.id, tableName: product.fields.table_name || addTable })
      });
      const data = await res.json();
      if (data.success) { setProducts(p => p.filter(x => x.id !== product.id)); showToast('تم حذف المنتج'); }
      else showToast(data.error || 'فشل الحذف');
    } catch(e) { showToast('خطأ في الحذف'); }
    setDeleting(null);
  }

  async function addProduct() {
    if (!addForm.name.trim() || !addForm.price_pi) { showToast('أدخل الاسم والسعر'); return; }
    setAdding(true);
    try {
      const res  = await fetch('/api/add-product', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table: addTable,
          username: user.username,
          fields: { ...addForm, price_pi: parseFloat(addForm.price_pi), seller_username: user.username }
        })
      });
      const data = await res.json();
      if (data.id) {
        showToast('تم إضافة المنتج بنجاح!');
        setShowAddForm(false);
        setAddForm({ name: '', price_pi: '', description: '', image_url: '' });
        setImgPreview('');
        await loadProducts(user.username);
      } else showToast(data.error || 'فشل إضافة المنتج');
    } catch(e) { showToast('خطأ في الإضافة'); }
    setAdding(false);
  }

  // ── Computed stats ──
  const totalPi       = orders.reduce((s, o) => s + (parseFloat(o.fields.amount_pi) || 0), 0);
  const pendingOrders = orders.filter(o => !o.fields.delivery_status || o.fields.delivery_status === 'pending');
  const deliveredOrders = orders.filter(o => o.fields.delivery_status === 'delivered');
  const unreadCount   = notifications.filter(n => !n.fields.is_read).length;

  const buildNotifWaLink = (n) => {
    const f = n.fields;
    const phone = String(f.seller_whatsapp || '').replace(/\D/g, '');
    const msg   = encodeURIComponent(`🛍️ طلب جديد في Souq Pi\n\nالمنتج: ${f.product_name || ''}\nالمبلغ: π ${f.amount_pi || ''}\nالمشتري: @${f.buyer_username || ''}\nرقم الدفعة: ${f.payment_id || ''}`);
    return `https://wa.me/${phone}?text=${msg}`;
  };

  return (
    <>
      <Head>
        <title>لوحة التاجر - Souq Pi</title>
        <script src="https://sdk.minepi.com/pi-sdk.js"></script>
        <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no" />
        <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap" rel="stylesheet" />
      </Head>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        body{background:#0a0118;color:#fff;font-family:'Cairo',sans-serif;direction:rtl;min-height:100vh;padding-bottom:40px;}
        .header{background:rgba(26,11,46,0.95);padding:14px 20px;border-bottom:1px solid #d4af37;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:100;}
        .back-btn{background:rgba(255,255,255,0.08);border:none;color:#fff;padding:8px 14px;border-radius:10px;cursor:pointer;font-family:'Cairo',sans-serif;font-size:0.85em;}
        .container{max-width:480px;margin:0 auto;padding:16px;}
        .stats-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:18px;}
        .stat-card{background:#1a0b2e;border:1px solid #331a5e;border-radius:14px;padding:14px;text-align:center;}
        .stat-num{font-weight:900;font-size:1.6em;line-height:1.1;}
        .stat-lbl{font-size:0.7em;color:#b0b0b0;margin-top:4px;}
        .tabs{display:flex;border-bottom:1px solid #331a5e;margin-bottom:16px;overflow-x:auto;scrollbar-width:none;}
        .tabs::-webkit-scrollbar{display:none;}
        .tab{flex:1;min-width:max-content;padding:10px 10px;background:none;border:none;color:#b0b0b0;font-family:'Cairo';font-size:0.8em;cursor:pointer;border-bottom:2px solid transparent;position:relative;white-space:nowrap;}
        .tab.active{color:#d4af37;border-bottom-color:#d4af37;font-weight:700;}
        .badge{position:absolute;top:4px;right:4px;background:#ef4444;color:#fff;font-size:0.6em;width:16px;height:16px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:900;}
        .btn-add{background:linear-gradient(135deg,#6a0dad,#d4af37);color:#fff;border:none;padding:9px 18px;border-radius:12px;font-weight:700;cursor:pointer;font-family:'Cairo';font-size:0.88em;}
        .pcard{background:#1a0b2e;border:1px solid #331a5e;border-radius:14px;padding:14px;margin-bottom:10px;display:flex;gap:12px;align-items:flex-start;}
        .pimg{width:60px;height:60px;border-radius:10px;object-fit:cover;background:#0a0118;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:1.6em;}
        .pname{font-weight:700;font-size:0.9em;margin-bottom:4px;}
        .pprice{color:#d4af37;font-weight:900;font-size:0.85em;}
        .btn-delete{background:rgba(239,68,68,0.15);border:1px solid #ef4444;color:#ef4444;padding:6px 12px;border-radius:8px;font-family:'Cairo';font-size:0.75em;cursor:pointer;margin-top:6px;}
        .btn-delete:disabled{opacity:0.5;}
        .form-box{background:#1a0b2e;border:1px solid #331a5e;border-radius:16px;padding:16px;margin-bottom:16px;}
        .input{width:100%;background:#0a0118;border:1px solid #6a0dad;padding:12px;border-radius:12px;color:#fff;font-family:'Cairo';margin-bottom:10px;outline:none;font-size:0.9em;}
        select.input{appearance:none;}
        .img-preview{width:100%;height:140px;border-radius:12px;object-fit:cover;margin-bottom:10px;border:1px solid #331a5e;}
        .order-card{background:#1a0b2e;border:1px solid #331a5e;border-radius:14px;padding:14px;margin-bottom:10px;}
        .btn-wa{display:inline-flex;align-items:center;gap:6px;background:#25d366;color:#fff;border:none;padding:8px 14px;border-radius:10px;font-weight:700;cursor:pointer;font-family:'Cairo';font-size:0.8em;text-decoration:none;margin-top:8px;}
        .btn-track{display:inline-flex;align-items:center;gap:5px;background:rgba(106,13,173,0.25);border:1px solid #6a0dad;color:#c084fc;padding:7px 12px;border-radius:10px;font-size:0.78em;cursor:pointer;font-family:'Cairo';font-weight:700;margin-top:8px;margin-right:6px;}
        .btn-login{background:linear-gradient(135deg,#6a0dad,#d4af37);color:#fff;border:none;padding:14px 30px;border-radius:14px;font-weight:900;cursor:pointer;font-family:'Cairo';font-size:1em;}
        .empty{text-align:center;padding:40px 20px;color:#b0b0b0;}
        .toast{position:fixed;bottom:30px;left:50%;transform:translateX(-50%);background:#6a0dad;padding:10px 20px;border-radius:20px;font-size:0.85em;z-index:2000;}
        .not-seller{text-align:center;padding:60px 20px;}
        .notif-card{border-radius:14px;padding:14px;margin-bottom:10px;border:1px solid;}
        .notif-card.unread{background:rgba(106,13,173,0.18);border-color:#6a0dad;}
        .notif-card.read{background:#1a0b2e;border-color:#331a5e;opacity:0.7;}
        .new-pill{background:#6a0dad;color:#fff;font-size:0.6em;padding:2px 8px;border-radius:10px;font-weight:700;display:inline-block;margin-bottom:6px;}
        .status-pill{display:inline-block;font-size:0.7em;padding:3px 10px;border-radius:10px;font-weight:700;margin-top:4px;}
      `}</style>

      <div className="header">
        <button className="back-btn" onClick={() => window.location.href = '/'}>← رجوع</button>
        <div style={{ fontWeight: 900 }}>لوحة التاجر</div>
        {user && isSeller && (
          <button className="btn-add" onClick={() => setShowAddForm(!showAddForm)}>
            {showAddForm ? '✕ إلغاء' : '+ منتج'}
          </button>
        )}
      </div>

      <div className="container">
        {!user ? (
          <div className="not-seller">
            <div style={{ fontSize: '3em', marginBottom: 12 }}>🏪</div>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>لوحة التاجر</div>
            <div style={{ fontSize: '0.85em', color: '#b0b0b0', marginBottom: 20 }}>سجّل الدخول لإدارة متجرك</div>
            <button className="btn-login" onClick={loginWithPi}>دخول بـ Pi</button>
          </div>
        ) : loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#b0b0b0' }}>⏳ جاري التحميل...</div>
        ) : !isSeller ? (
          <div className="not-seller">
            <div style={{ fontSize: '3em', marginBottom: 12 }}>🔒</div>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>لست تاجراً معتمداً بعد</div>
            <div style={{ fontSize: '0.85em', color: '#b0b0b0', marginBottom: 20 }}>قدّم طلب الانضمام أولاً</div>
            <button className="btn-login" onClick={() => window.location.href = '/become-seller'}>تقديم طلب</button>
          </div>
        ) : (
          <>
            {/* ── Add Product Form ── */}
            {showAddForm && (
              <div className="form-box">
                <div style={{ fontWeight: 800, marginBottom: 12, color: '#d4af37' }}>➕ إضافة منتج جديد</div>
                <select className="input" value={addTable} onChange={e => setAddTable(e.target.value)}>
                  {TABLES.map(t => <option key={t.key} value={t.key}>{t.icon} {t.ar}</option>)}
                </select>
                <input className="input" type="text" placeholder="اسم المنتج *" value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} />
                <input className="input" type="number" min="0" placeholder="السعر بـ Pi *" value={addForm.price_pi} onChange={e => setAddForm(f => ({ ...f, price_pi: e.target.value }))} />
                <input className="input" type="text" placeholder="وصف المنتج (اختياري)" value={addForm.description} onChange={e => setAddForm(f => ({ ...f, description: e.target.value }))} />
                <input
                  className="input"
                  type="url"
                  placeholder="رابط صورة المنتج (اختياري)"
                  value={addForm.image_url}
                  onChange={e => {
                    setAddForm(f => ({ ...f, image_url: e.target.value }));
                    setImgPreview(e.target.value);
                  }}
                />
                {imgPreview && (
                  <img
                    className="img-preview"
                    src={imgPreview}
                    alt="معاينة الصورة"
                    onError={() => setImgPreview('')}
                  />
                )}
                <button
                  onClick={addProduct}
                  disabled={adding}
                  style={{ background: 'linear-gradient(135deg,#6a0dad,#d4af37)', color: '#fff', border: 'none', padding: '12px', borderRadius: '12px', width: '100%', fontWeight: 900, cursor: 'pointer', fontFamily: 'Cairo', opacity: adding ? 0.6 : 1 }}
                >
                  {adding ? '⏳ جاري الإضافة...' : 'إضافة المنتج'}
                </button>
              </div>
            )}

            {/* ── Stats Overview ── */}
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-num" style={{ color: '#d4af37' }}>π {totalPi.toFixed(2)}</div>
                <div className="stat-lbl">إجمالي الأرباح</div>
              </div>
              <div className="stat-card">
                <div className="stat-num" style={{ color: '#c084fc' }}>{orders.length}</div>
                <div className="stat-lbl">إجمالي الطلبات</div>
              </div>
              <div className="stat-card">
                <div className="stat-num" style={{ color: '#eab308' }}>{pendingOrders.length}</div>
                <div className="stat-lbl">طلبات معلقة</div>
              </div>
              <div className="stat-card">
                <div className="stat-num" style={{ color: '#22c55e' }}>{deliveredOrders.length}</div>
                <div className="stat-lbl">طلبات مسلّمة</div>
              </div>
              <div className="stat-card">
                <div className="stat-num" style={{ color: '#38bdf8' }}>{products.length}</div>
                <div className="stat-lbl">منتجات نشطة</div>
              </div>
              <div className="stat-card">
                <div className="stat-num" style={{ color: '#ef4444' }}>{unreadCount}</div>
                <div className="stat-lbl">إشعارات جديدة</div>
              </div>
            </div>

            {/* ── Tabs ── */}
            <div className="tabs">
              <button className={`tab ${tab === 'overview' ? 'active' : ''}`} onClick={() => setTab('overview')}>
                📊 نظرة عامة
              </button>
              <button className={`tab ${tab === 'products' ? 'active' : ''}`} onClick={() => setTab('products')}>
                🛒 منتجاتي ({products.length})
              </button>
              <button className={`tab ${tab === 'orders' ? 'active' : ''}`} onClick={() => setTab('orders')}>
                📦 الطلبات ({orders.length})
              </button>
              <button className={`tab ${tab === 'notifications' ? 'active' : ''}`} onClick={() => setTab('notifications')}>
                🔔 التنبيهات
                {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
              </button>
            </div>

            {/* ── OVERVIEW TAB ── */}
            {tab === 'overview' && (
              <>
                <div style={{ fontWeight: 800, marginBottom: 12, color: '#d4af37' }}>آخر 5 طلبات</div>
                {orders.length === 0 ? (
                  <div className="empty">لا توجد طلبات بعد</div>
                ) : orders.slice(0, 5).map(o => {
                  const f = o.fields;
                  const ds = f.delivery_status || 'pending';
                  const st = DELIVERY_STATUS[ds] || DELIVERY_STATUS.pending;
                  return (
                    <div key={o.id} className="order-card" style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <div style={{ fontWeight: 700, fontSize: '0.88em' }}>{f.product_name}</div>
                        <div style={{ color: '#d4af37', fontWeight: 900 }}>π {f.amount_pi}</div>
                      </div>
                      <div style={{ fontSize: '0.72em', color: '#b0b0b0', marginTop: 3 }}>@{f.username}</div>
                      <span className="status-pill" style={{ background: `${st.color}20`, color: st.color, border: `1px solid ${st.color}55` }}>
                        {st.label}
                      </span>
                    </div>
                  );
                })}
                {orders.length > 5 && (
                  <button onClick={() => setTab('orders')} style={{ width: '100%', background: 'none', border: '1px solid #331a5e', color: '#b0b0b0', padding: '10px', borderRadius: '12px', cursor: 'pointer', fontFamily: 'Cairo', marginTop: 4 }}>
                    عرض كل الطلبات ({orders.length}) →
                  </button>
                )}
              </>
            )}

            {/* ── PRODUCTS TAB ── */}
            {tab === 'products' && (
              <>
                {products.length === 0 ? (
                  <div className="empty">
                    <div style={{ fontSize: '2.5em', marginBottom: 10 }}>📦</div>
                    لا توجد منتجات بعد<br />
                    <small>اضغط "+ منتج" لإضافة منتجك الأول</small>
                  </div>
                ) : products.map(p => (
                  <div key={p.id} className="pcard">
                    {p.fields.image_url
                      ? <img src={p.fields.image_url} alt="" className="pimg" style={{ borderRadius: 10, objectFit: 'cover' }} onError={e => e.target.style.display='none'} />
                      : <div className="pimg">📦</div>
                    }
                    <div style={{ flex: 1 }}>
                      <div className="pname">{p.fields.name}</div>
                      <div className="pprice">π {p.fields.price_pi}</div>
                      <div style={{ fontSize: '0.7em', color: '#b0b0b0', marginTop: 2 }}>{p.fields.table_name || ''}</div>
                      {p.fields.description && (
                        <div style={{ fontSize: '0.72em', color: '#b0b0b0', marginTop: 4, lineHeight: 1.4 }}>
                          {p.fields.description.slice(0, 80)}{p.fields.description.length > 80 ? '...' : ''}
                        </div>
                      )}
                      <button className="btn-delete" onClick={() => deleteProduct(p)} disabled={deleting === p.id}>
                        {deleting === p.id ? '⏳ جاري الحذف...' : '🗑️ حذف'}
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}

            {/* ── ORDERS TAB ── */}
            {tab === 'orders' && (
              <>
                {orders.length === 0 ? (
                  <div className="empty">
                    <div style={{ fontSize: '2.5em', marginBottom: 10 }}>📦</div>
                    لا توجد طلبات بعد
                  </div>
                ) : orders.map(o => {
                  const f  = o.fields;
                  const ds = f.delivery_status || 'pending';
                  const st = DELIVERY_STATUS[ds] || DELIVERY_STATUS.pending;
                  const { phone, msg } = buildBuyerWaMessage(o);
                  return (
                    <div key={o.id} className="order-card">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: '0.9em', marginBottom: 3 }}>{f.product_name}</div>
                          <div style={{ color: '#d4af37', fontWeight: 900, fontSize: '0.85em' }}>π {f.amount_pi}</div>
                          <div style={{ fontSize: '0.75em', color: '#b0b0b0', marginTop: 4 }}>
                            المشتري: @{f.username}
                          </div>
                          <div style={{ fontSize: '0.7em', color: '#b0b0b0', marginTop: 2 }}>
                            {f.created_at ? f.created_at.split('T')[0] : ''}
                          </div>
                          <span className="status-pill" style={{ background: `${st.color}20`, color: st.color, border: `1px solid ${st.color}55` }}>
                            {st.label}
                          </span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button className="btn-track" onClick={() => window.location.href = `/order/${o.id}`}>
                          🔍 تتبع الطلب
                        </button>
                        <a
                          className="btn-wa"
                          href={`https://wa.me/${phone}?text=${msg}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          💬 تواصل مع المشتري
                        </a>
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            {/* ── NOTIFICATIONS TAB ── */}
            {tab === 'notifications' && (
              <>
                {notifications.length === 0 ? (
                  <div className="empty">
                    <div style={{ fontSize: '2.5em', marginBottom: 10 }}>🔔</div>
                    لا توجد تنبيهات بعد<br />
                    <small>ستظهر هنا عند وصول طلب جديد</small>
                  </div>
                ) : notifications.map(n => (
                  <div key={n.id} className={`notif-card ${n.fields.is_read ? 'read' : 'unread'}`}>
                    {!n.fields.is_read && <span className="new-pill">🔔 جديد</span>}
                    <div style={{ fontWeight: 800, fontSize: '0.92em', marginBottom: 4 }}>🛒 طلب جديد</div>
                    <div style={{ fontSize: '0.82em', marginBottom: 2 }}>
                      <span style={{ color: '#b0b0b0' }}>المنتج: </span>{n.fields.product_name}
                    </div>
                    <div style={{ color: '#d4af37', fontWeight: 900, fontSize: '0.88em', marginBottom: 2 }}>
                      π {n.fields.amount_pi}
                    </div>
                    <div style={{ fontSize: '0.76em', color: '#b0b0b0' }}>
                      المشتري: @{n.fields.buyer_username}
                    </div>
                    <div style={{ fontSize: '0.66em', color: '#6a0dad', marginTop: 3, direction: 'ltr', textAlign: 'right' }}>
                      #{n.fields.payment_id?.slice(0, 14)}...
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                      {n.fields.seller_whatsapp && (
                        <a className="btn-wa" href={buildNotifWaLink(n)} target="_blank" rel="noopener noreferrer" onClick={() => markRead(n.id)}>
                          💬 تواصل مع المشتري
                        </a>
                      )}
                      {!n.fields.is_read && (
                        <button onClick={() => markRead(n.id)} style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid #331a5e', color: '#b0b0b0', padding: '6px 12px', borderRadius: '10px', font: 'inherit', fontSize: '0.75em', cursor: 'pointer' }}>
                          ✓ مقروء
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </div>

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
