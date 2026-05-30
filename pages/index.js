import { useState, useEffect, useRef } from 'react';  
import Head from 'next/head';  
import { usePiPrice } from '../context/PiPriceContext';  
  
const SECTIONS = [  
  { key: 'Cars',        ar: 'سيارات',      icon: '🚗', gradient: 'linear-gradient(135deg,#1a0b2e,#6a0dad)' },  
  { key: 'Electric',    ar: 'كهربائيات',   icon: '⚡', gradient: 'linear-gradient(135deg,#1a0b2e,#d4af37)' },  
  { key: 'Electronics', ar: 'إلكترونيات',  icon: '📱', gradient: 'linear-gradient(135deg,#2d1b69,#6a0dad)' },  
  { key: 'Real_Estate', ar: 'عقارات',       icon: '🏠', gradient: 'linear-gradient(135deg,#1a0b2e,#4a1942)' },  
];  
const TABLE_LABELS = { Cars: 'سيارات 🚗', Electronics: 'إلكترونيات 📱', Electric: 'كهربائيات ⚡', Real_Estate: 'عقارات 🏠' };  
  
const FEATURED = [  
  { icon: '🚗', title: 'أحدث السيارات',    sub: 'تويوتا · هيونداي · BMW' },  
  { icon: '📱', title: 'إلكترونيات 2026', sub: 'آيفون · سامسونج · سوني' },  
  { icon: '🏠', title: 'عقارات مميزة',    sub: 'فلل · شقق · أراضي' },  
];  
  
export default function Home() {  
  const piPrice = usePiPrice();  
  const [user, setUser]               = useState(null);  
  const [page, setPage]               = useState('home');  
  const [section, setSection]         = useState(null);  
  const [products, setProducts]       = useState([]);  
  const [loading, setLoading]         = useState(false);  
  const [toast, setToast]             = useState('');  
  const [paying, setPaying]           = useState(null);  
  const [calcPi, setCalcPi]           = useState('');  
  const [featuredIdx, setFeaturedIdx] = useState(0);  
  const [searchQuery,   setSearchQuery]   = useState('');  
  const [searchResults, setSearchResults] = useState([]);  
  const [searching,     setSearching]     = useState(false);  
  const debounceRef = useRef(null);  
  
  useEffect(() => {  
    const initPi = async () => {  
      if (typeof window !== 'undefined' && window.Pi) {  
        await window.Pi.init({ version: '2.0', sandbox: false });  
      } else { setTimeout(initPi, 500); }  
    };  
    initPi();  
    const t = setInterval(() => setFeaturedIdx(i => (i + 1) % FEATURED.length), 4000);  
    return () => clearInterval(t);  
  }, []);  
  
  useEffect(() => {  
    if (section) loadProducts(section);  
  }, [section]);  
  
  useEffect(() => {  
    clearTimeout(debounceRef.current);  
    const q = searchQuery.trim();  
    if (q.length < 2) { setSearchResults([]); setSearching(false); return; }  
    setSearching(true);  
    debounceRef.current = setTimeout(async () => {  
      try {  
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);  
        const d   = await res.json();  
        setSearchResults(d.records || []);  
      } catch { setSearchResults([]); }  
      setSearching(false);  
    }, 420);  
    return () => clearTimeout(debounceRef.current);  
  }, [searchQuery]);  
  
  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 4000); };  
  
  async function loginWithPi() {  
    try {  
      if (!window.Pi) { showToast('يرجى الفتح من متصفح Pi'); return; }  
      const auth = await window.Pi.authenticate(['username', 'payments', 'wallet_address'], {  
        onIncompletePaymentFound: async (p) => {  
          try {  
            await fetch('/api/payment', {  
              method: 'POST',  
              headers: { 'Content-Type': 'application/json' },  
              body: JSON.stringify({ action: 'approve', paymentId: p.identifier })  
            });  
            await fetch('/api/payment', {  
              method: 'POST',  
              headers: { 'Content-Type': 'application/json' },  
              body: JSON.stringify({  
                action: 'complete',  
                paymentId: p.identifier,  
                txid: p.transaction?.txid,  
                username: auth?.user?.username || '',  
                buyer_uid: auth?.user?.uid || '',  
                buyer_wallet: auth?.user?.wallet_address || '',  
                productId: p.metadata?.id || '',  
                productName: p.memo || '',  
                amountPi: p.amount || 0,  
                tableName: '',  
                sellerUsername: ''  
              })  
            });  
          } catch(e) {}  
        }  
      });  
      setUser(auth.user);  
      showToast(`مرحباً @${auth.user.username}`);  
    } catch(e) { showToast('فشل الدخول'); }  
  }  
  
  async function loadProducts(t) {  
    setLoading(true);  
    try {  
      const res = await fetch(`/api/products?table=${t}`);  
      const d   = await res.json();  
      setProducts(d.records || []);  
    } catch(e) { showToast('خطأ في التحميل'); }  
    setLoading(false);  
  }  
  
  async function buyWithPi(p, tbl) {  
    if (!user) { loginWithPi(); return; }  
    setPaying(p.id);  
    const tableName = tbl || section;  
    const callbacks = {  
      onReadyForServerApproval: async (id) => {  
        await fetch('/api/payment', {  
          method: 'POST',  
          headers: { 'Content-Type': 'application/json' },  
          body: JSON.stringify({ action: 'approve', paymentId: id })  
        });  
      },  
      onReadyForServerCompletion: async (id, tx) => {  
        await fetch('/api/payment', {  
          method: 'POST',  
          headers: { 'Content-Type': 'application/json' },  
          body: JSON.stringify({  
            action: 'complete',  
            paymentId: id,  
            txid: tx?.txid || tx,  
            username: user.username,  
            buyer_uid: user.uid || '',  
            buyer_wallet: user.wallet_address || '',  
            productId: p.id,  
            productName: p.fields.name,  
            amountPi: p.fields.price_pi,  
            tableName,  
            sellerUsername: p.fields.seller_username || ''  
          })  
        });  
        showToast('تم الشراء بنجاح! 🎉');  
        setPaying(null);  
      },  
      onCancel: () => setPaying(null),  
      onError: () => { showToast('فشل الدفع'); setPaying(null); }  
    };  
    window.Pi.createPayment({ amount: Number(p.fields.price_pi), memo: p.fields.name, metadata: { id: p.id } }, callbacks);  
  }  
  
  const isSearching = searchQuery.trim().length >= 2;  
  
  return (  
    <>  
      <Head>  
        <title>Souq Pi - V3</title>  
        <script src="https://sdk.minepi.com/pi-sdk.js"></script>  
        <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no" />  
        <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap" rel="stylesheet" />  
      </Head>  
  
      <style>{`  
        *{box-sizing:border-box;margin:0;padding:0;}  
        body{background:#0a0118;color:#fff;font-family:'Cairo',sans-serif;direction:rtl;padding-bottom:100px;}  
        .navbar{display:flex;align-items:center;justify-content:space-between;padding:12px 20px;background:#1a0b2e;border-bottom:1px solid #d4af37;position:sticky;top:0;z-index:100;}  
        .navbar-logo{width:38px;height:38px;background:linear-gradient(135deg,#6a0dad,#d4af37);border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:900;flex-shrink:0;}  
        .search-wrap{padding:10px 16px;background:#0f0522;border-bottom:1px solid #1e0a3c;position:sticky;top:62px;z-index:90;}  
        .search-inner{display:flex;align-items:center;background:#1a0b2e;border:1.5px solid #6a0dad;border-radius:14px;padding:0 12px;gap:8px;transition:border-color 0.2s;}  
        .search-inner:focus-within{border-color:#d4af37;}  
        .search-inner input{flex:1;background:transparent;border:none;outline:none;color:#fff;font-family:'Cairo';font-size:0.9em;padding:11px 0;direction:rtl;}  
        .search-inner input::placeholder{color:#6a0dad;opacity:0.8;}  
        .search-icon{color:#6a0dad;font-size:1.1em;flex-shrink:0;}  
        .search-clear{background:none;border:none;color:#b0b0b0;cursor:pointer;font-size:1.1em;padding:0;flex-shrink:0;}  
        .search-meta{font-size:0.8em;color:#b0b0b0;padding:10px 16px 4px;display:flex;align-items:center;gap:6px;}  
        .search-meta strong{color:#d4af37;}  
        .search-spinner{width:14px;height:14px;border:2px solid #6a0dad;border-top-color:#d4af37;border-radius:50%;animation:spin 0.7s linear infinite;flex-shrink:0;}  
        @keyframes spin{to{transform:rotate(360deg);}}  
        .search-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:0 12px 12px;}  
        .search-empty{text-align:center;padding:36px;color:#b0b0b0;font-size:0.85em;}  
        .cat-chip{display:inline-block;font-size:0.6em;background:rgba(106,13,173,0.25);border:1px solid #6a0dad;color:#c084fc;padding:2px 8px;border-radius:10px;margin-bottom:4px;}  
        .hero{padding:16px;}  
        .featured-slider{background:rgba(255,255,255,0.04);border-radius:20px;padding:25px;margin-bottom:16px;border:1px solid rgba(255,255,255,0.1);text-align:center;}  
        .calc-box{background:rgba(106,13,173,0.1);border:1px solid #6a0dad;border-radius:20px;padding:15px;margin:0 0 16px;}  
        .calc-input{width:100%;background:#0a0118;border:1px solid #6a0dad;padding:12px;border-radius:12px;color:#fff;text-align:center;outline:none;font-family:'Cairo';box-sizing:border-box;}  
        .categories{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;}  
        .cat-card{border-radius:20px;padding:25px 10px;cursor:pointer;text-align:center;transition:transform 0.15s;}  
        .cat-card:active{transform:scale(0.97);}  
        .products{padding:12px;display:grid;grid-template-columns:1fr 1fr;gap:12px;}  
        .pcard{background:#1a0b2e;border:1px solid #331a5e;border-radius:15px;overflow:hidden;}  
        .pimg{width:100%;height:110px;object-fit:cover;background:#0a0118;}  
        .pinfo{padding:10px;}  
        .buybtn{background:linear-gradient(135deg,#6a0dad,#d4af37);color:#fff;border:none;padding:8px;border-radius:10px;width:100%;font-weight:700;cursor:pointer;font-family:'Cairo';}  
        .buybtn:disabled{opacity:0.6;cursor:not-allowed;}  
        .bottom-nav{position:fixed;bottom:0;left:0;right:0;background:#1a0b2e;display:flex;justify-content:space-around;padding:12px;border-top:1px solid #6a0dad;z-index:1000;}  
        .nav-item{text-align:center;font-size:0.7em;cursor:pointer;color:#b0b0b0;flex:1;}  
        .nav-item.active{color:#d4af37;}  
        .toast{position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:#6a0dad;padding:10px 20px;border-radius:20px;z-index:2000;max-width:90%;text-align:center;font-size:0.8em;}  
        .sell-banner{margin-bottom:20px;background:rgba(212,175,55,0.1);border:1px solid #d4af37;border-radius:15px;padding:15px;display:flex;justify-content:space-between;align-items:center;cursor:pointer;}  
        .back-btn{background:rgba(255,255,255,0.08);border:none;color:#fff;padding:8px 14px;border-radius:10px;cursor:pointer;font-family:'Cairo',sans-serif;font-size:0.85em;margin:12px;}  
        .wa-float{position:fixed;left:18px;bottom:88px;z-index:1500;width:50px;height:50px;background:#25d366;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.5em;box-shadow:0 4px 18px rgba(37,211,102,0.5);cursor:pointer;text-decoration:none;transition:transform 0.15s;}  
        .wa-float:active{transform:scale(0.92);}  
        .wa-bubble{position:fixed;left:74px;bottom:96px;z-index:1500;background:#25d366;color:#fff;font-family:'Cairo',sans-serif;font-size:0.72em;padding:5px 11px;border-radius:14px;white-space:nowrap;pointer-events:none;box-shadow:0 2px 8px rgba(0,0,0,0.3);}  
        .wa-btn{display:flex;align-items:center;gap:5px;background:#25d366;color:#fff;border:none;padding:7px 10px;border-radius:10px;width:100%;font-weight:700;cursor:pointer;font-family:'Cairo';font-size:0.75em;margin-top:5px;}  
      `}</style>  
  
      <nav className="navbar">  
        <div onClick={() => { setPage('home'); setSection(null); setSearchQuery(''); }} style={{ display: 'flex', gap: '8px', alignItems: 'center', cursor: 'pointer' }}>  
          <div className="navbar-logo">π</div>  
          <div style={{ fontWeight: 900 }}>Souq Pi <small style={{ color: '#d4af37' }}>V3</small></div>  
        </div>  
        {user ? (  
          <div style={{ textAlign: 'left' }}>  
            <div style={{ color: '#d4af37', fontSize: '0.8em' }}>@{user.username}</div>    
          </div>  
        ) : (  
          <button onClick={loginWithPi} style={{ background: '#d4af37', border: 'none', padding: '6px 15px', borderRadius: '20px', fontWeight: 700, fontFamily: 'Cairo', cursor: 'pointer' }}>دخول</button>  
        )}  
      </nav>  
  
      <div className="search-wrap">  
        <div className="search-inner">  
          <span className="search-icon">🔍</span>  
          <input  
            type="text"  
            placeholder="ابحث عن أي منتج في السوق..."  
            value={searchQuery}  
            onChange={e => { setSearchQuery(e.target.value); if (page !== 'home') { setPage('home'); setSection(null); } }}  
          />  
          {searchQuery && (  
            <button className="search-clear" onClick={() => setSearchQuery('')}>✕</button>  
          )}  
        </div>  
      </div>  
  
      {isSearching ? (  
        <>  
          <div className="search-meta">  
            {searching  
              ? <><div className="search-spinner" /><span>جاري البحث...</span></>  
              : <><strong>{searchResults.length}</strong><span>نتيجة لـ "{searchQuery.trim()}"</span></>  
            }  
          </div>  
          {!searching && searchResults.length === 0 && (  
            <div className="search-empty">  
              <div style={{ fontSize: '2em', marginBottom: 8 }}>🔍</div>  
              <div>لا توجد نتائج لـ "<strong style={{ color: '#d4af37' }}>{searchQuery}</strong>"</div>  
              <div style={{ fontSize: '0.78em', marginTop: 6, color: '#6a0dad' }}>جرّب كلمة أخرى</div>  
            </div>  
          )}  
          <div className="search-grid">  
            {searchResults.map(r => (  
              <div key={r.id} className="pcard">  
                {r.fields.image_url  
                  ? <img className="pimg" src={r.fields.image_url} alt="" />  
                  : <div className="pimg" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2em' }}>📦</div>}  
                <div className="pinfo">  
                  <div className="cat-chip">{TABLE_LABELS[r._table] || r._table}</div>  
                  <div style={{ fontSize: '0.75em', fontWeight: 700, height: '35px', overflow: 'hidden' }}>{r.fields.name}</div>  
                  <div style={{ color: '#d4af37', fontWeight: 900, margin: '5px 0' }}>π {Number(r.fields.price_pi).toFixed(2)}</div>  
                  <button className="buybtn" onClick={() => buyWithPi(r, r._table)} disabled={paying === r.id}>  
                    {paying === r.id ? 'جاري...' : 'شراء'}  
                  </button>  
                  {r.fields.whatsapp && (  
                    <a className="wa-btn" href={`https://wa.me/${String(r.fields.whatsapp).replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer">  
                      <span>💬</span> واتساب البائع  
                    </a>  
                  )}  
                </div>  
              </div>  
            ))}  
          </div>  
        </>  
      ) : page === 'home' ? (  
        <div className="hero">  
          <div className="featured-slider">  
            <div style={{ fontSize: '2.2em' }}>{FEATURED[featuredIdx].icon}</div>  
            <div style={{ fontWeight: 800 }}>{FEATURED[featuredIdx].title}</div>  
            <div style={{ fontSize: '0.66em', color: '#b0b0b0' }}>{FEATURED[featuredIdx].sub}</div>  
          </div>  
          <div className="calc-box">  
            <input className="calc-input" type="number" value={calcPi} onChange={e => setCalcPi(e.target.value)} placeholder="كمية π" />  
            <div style={{ marginTop: 10, color: '#4ade80', fontWeight: 900, textAlign: 'center' }}>  
              $ {calcPi && piPrice ? (calcPi * piPrice).toFixed(2) : '0.00'}  
            </div>  
          </div>  
          <div className="categories">  
            {SECTIONS.map(s => (  
              <div key={s.key} className="cat-card" style={{ background: s.gradient }}  
                onClick={() => { setSection(s.key); setPage('section'); }}>  
                <div style={{ fontSize: '2.5em' }}>{s.icon}</div>  
                <div style={{ fontWeight: 700 }}>{s.ar}</div>  
              </div>  
            ))}  
          </div>  
          <div className="sell-banner" onClick={() => window.location.href = '/become-seller'}>  
            <div style={{ textAlign: 'right' }}>  
              <div style={{ fontWeight: 800 }}>🏪 هل تريد البيع؟</div>  
              <div style={{ fontSize: '0.7em', color: '#b0b0b0' }}>انضم كتاجر الآن</div>  
            </div>  
            <button style={{ background: '#d4af37', border: 'none', padding: '5px 12px', borderRadius: '10px', fontWeight: 700, fontFamily: 'Cairo', cursor: 'pointer' }}>انضم</button>  
          </div>  
        </div>  
      ) : (  
        <div>  
          <button className="back-btn" onClick={() => { setPage('home'); setSection(null); }}>← رجوع</button>  
          <div className="products">  
            {loading ? (  
              <p style={{ gridColumn: '1/3', textAlign: 'center', padding: 40, color: '#b0b0b0' }}>جاري التحميل...</p>  
            ) : products.length === 0 ? (  
              <p style={{ gridColumn: '1/3', textAlign: 'center', padding: 40, color: '#b0b0b0' }}>لا توجد منتجات بعد</p>  
            ) : products.map(r => (  
              <div key={r.id} className="pcard">  
                {r.fields.image_url && <img className="pimg" src={r.fields.image_url} alt="" />}  
                <div className="pinfo">  
                  <div style={{ fontSize: '0.75em', fontWeight: 700, height: '35px', overflow: 'hidden' }}>{r.fields.name}</div>  
                  <div style={{ color: '#d4af37', fontWeight: 900, margin: '5px 0' }}>π {Number(r.fields.price_pi).toFixed(2)}</div>  
                  <button className="buybtn" onClick={() => buyWithPi(r)} disabled={paying === r.id}>  
                    {paying === r.id ? 'جاري...' : 'شراء'}  
                  </button>  
                  {r.fields.whatsapp && (  
                    <a className="wa-btn" href={`https://wa.me/${String(r.fields.whatsapp).replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer">  
                      <span>💬</span> واتساب البائع  
                    </a>  
                  )}  
                </div>  
              </div>  
            ))}  
          </div>  
        </div>  
      )}  
  
      {page === 'section' && !isSearching && (  
        <>  
          <a className="wa-float" href="https://wa.me/" target="_blank" rel="noopener noreferrer">💬</a>  
          <div className="wa-bubble">تواصل معنا</div>  
        </>  
      )}  
  
      <div className="bottom-nav">  
        <div className={`nav-item ${page === 'home' && !isSearching ? 'active' : ''}`} onClick={() => { setPage('home'); setSection(null); setSearchQuery(''); }}>🏠<br />الرئيسية</div>  
        <div className="nav-item" onClick={() => window.location.href = '/explore'}>🔍<br />استكشف</div>  
        <div className="nav-item" onClick={() => window.location.href = '/my-orders'}>📦<br />طلباتي</div>  
        <div className="nav-item" onClick={() => window.location.href = '/become-seller'}>🏪<br />بيّع</div>  
      </div>  
  
      {toast && <div className="toast">{toast}</div>}  
    </>  
  );  
}
