import React from 'react';
import {AbsoluteFill, Easing, interpolate, useCurrentFrame} from 'remotion';

const ease = Easing.bezier(0.16, 1, 0.3, 1);

const clamp = (frame: number, input: number[], output: number[]) =>
  interpolate(frame, input, output, {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: ease,
  });

const money = (value: number) => `PKR ${Math.round(value).toLocaleString('en-US')}`;

const BrandMark = ({size = 110}: {size?: number}) => (
  <svg width={size} height={size} viewBox="0 0 512 512" aria-label="MunshiOS logo">
    <defs>
      <linearGradient id="munshiNavyV2" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#123A55" />
        <stop offset="1" stopColor="#061D2E" />
      </linearGradient>
      <linearGradient id="munshiTealV2" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stopColor="#087C72" />
        <stop offset="1" stopColor="#11B79E" />
      </linearGradient>
    </defs>
    <path fill="url(#munshiNavyV2)" d="M68 90c0-13 15-21 26-14l162 111L418 76c11-7 26 1 26 14v61L256 279 142 201v203l-74-43V90Z" />
    <path fill="url(#munshiTealV2)" d="M262 306c0-8 5-15 12-19l42-24v141h-54v-98Zm70-47c0-8 4-15 11-19l43-25v189h-54V259Zm70-47c0-8 4-15 11-19l31-18v186l-42 24V212Z" />
  </svg>
);

const Backdrop = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#06151d',
        backgroundImage:
          'radial-gradient(circle at 18% 8%, rgba(17,183,158,.2), transparent 30%), radial-gradient(circle at 82% 85%, rgba(5,150,105,.15), transparent 35%), linear-gradient(rgba(255,255,255,.022) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.022) 1px, transparent 1px)',
        backgroundSize: 'auto, auto, 76px 76px, 76px 76px',
        backgroundPosition: `0 0, 0 0, ${frame * 0.12}px ${frame * 0.08}px, ${frame * 0.12}px ${frame * 0.08}px`,
      }}
    >
      <div
        style={{
          position: 'absolute',
          width: 760,
          height: 760,
          borderRadius: '50%',
          left: -360 + Math.sin(frame / 80) * 35,
          top: 520,
          background: 'rgba(16,185,129,.06)',
          filter: 'blur(80px)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, rgba(6,21,29,.05), rgba(6,21,29,.22) 55%, rgba(3,10,14,.72))',
        }}
      />
    </AbsoluteFill>
  );
};

const Headline = ({start, end, eyebrow, title}: {start: number; end: number; eyebrow: string; title: string}) => {
  const frame = useCurrentFrame();
  const opacity = clamp(frame, [start, start + 14, end - 14, end], [0, 1, 1, 0]);
  const y = clamp(frame, [start, start + 20, end - 16, end], [32, 0, 0, -24]);
  const blur = clamp(frame, [start, start + 14, end - 14, end], [8, 0, 0, 8]);
  return (
    <div
      style={{
        position: 'absolute',
        left: 70,
        right: 70,
        top: 94,
        opacity,
        translate: `0px ${y}px`,
        filter: `blur(${blur}px)`,
        zIndex: 30,
      }}
    >
      <div style={{fontSize: 19, color: '#5eead4', fontWeight: 800, letterSpacing: 3.1, textTransform: 'uppercase'}}>{eyebrow}</div>
      <div style={{fontSize: 74, lineHeight: 0.98, letterSpacing: -4.8, color: '#f8fafc', fontWeight: 860, maxWidth: 900, marginTop: 15}}>{title}</div>
    </div>
  );
};

const Card = ({children, style}: {children: React.ReactNode; style?: React.CSSProperties}) => (
  <div
    style={{
      border: '1px solid #e5e7eb',
      background: '#ffffff',
      borderRadius: 18,
      boxShadow: '0 12px 28px rgba(15,23,42,.06)',
      ...style,
    }}
  >
    {children}
  </div>
);

const Kpi = ({label, value, tone}: {label: string; value: string; tone?: string}) => (
  <Card style={{padding: '16px 17px', minHeight: 92}}>
    <div style={{fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.2, color: '#94a3b8', fontWeight: 800}}>{label}</div>
    <div style={{fontSize: 22, color: tone ?? '#0f172a', fontWeight: 850, marginTop: 7, letterSpacing: -0.7}}>{value}</div>
  </Card>
);

const navItems = ['Dashboard', 'Sales', 'Inventory', 'Purchases', 'Customers', 'Accounting', 'Reports', 'Settings'];

const activeNav = (frame: number) => {
  if (frame < 105) return 'Dashboard';
  if (frame < 260) return 'Sales';
  if (frame < 420) return 'Inventory';
  if (frame < 555) return 'Customers';
  if (frame < 700) return 'Purchases';
  if (frame < 835) return 'Reports';
  return 'Settings';
};

const ScreenLayer = ({start, end, children}: {start: number; end: number; children: React.ReactNode}) => {
  const frame = useCurrentFrame();
  const opacity = clamp(frame, [start, start + 22, end - 22, end], [0, 1, 1, 0]);
  const x = clamp(frame, [start, start + 28, end - 20, end], [64, 0, 0, -52]);
  const scale = clamp(frame, [start, start + 28, end - 18, end], [0.985, 1, 1, 1.012]);
  const blur = clamp(frame, [start, start + 18, end - 16, end], [6, 0, 0, 5]);
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        opacity,
        translate: `${x}px 0px`,
        scale,
        filter: `blur(${blur}px)`,
      }}
    >
      {children}
    </div>
  );
};

const DashboardScreen = () => {
  const frame = useCurrentFrame();
  const bars = [44, 58, 52, 74, 66, 83, 78, 92];
  return (
    <div style={{padding: 24, height: '100%', color: '#0f172a'}}>
      <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
        <div>
          <div style={{fontSize: 13, color: '#64748b', fontWeight: 700}}>Good morning</div>
          <div style={{fontSize: 29, fontWeight: 850, letterSpacing: -1.1, marginTop: 3}}>Business overview</div>
        </div>
        <div style={{fontSize: 12, background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', padding: '9px 12px', borderRadius: 999, fontWeight: 800}}>Live workspace</div>
      </div>
      <div style={{display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 11, marginTop: 19}}>
        <Kpi label="Today sales" value="PKR 428k" />
        <Kpi label="Received" value="PKR 216k" tone="#047857" />
        <Kpi label="Receivable" value="PKR 1.84m" />
        <Kpi label="Low stock" value="7 items" tone="#b45309" />
      </div>
      <div style={{display: 'grid', gridTemplateColumns: '1.25fr .75fr', gap: 13, marginTop: 14}}>
        <Card style={{padding: 18, minHeight: 244}}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
            <div>
              <div style={{fontSize: 11, color: '#059669', fontWeight: 900, letterSpacing: 1.4}}>AAJ KA MUNSHI</div>
              <div style={{fontSize: 20, fontWeight: 820, marginTop: 4}}>4 things need attention today</div>
            </div>
            <div style={{fontSize: 11, color: '#64748b'}}>Prioritized from live data</div>
          </div>
          {[['Collect overdue payment', 'PKR 145,000', '#fef2f2'], ['Reorder low stock', '3 products', '#fffbeb'], ['Supplier balance review', 'PKR 320,000', '#eff6ff']].map(([a, b, bg], i) => (
            <div key={a} style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 13px', borderRadius: 12, marginTop: 9, background: bg, opacity: clamp(frame, [20 + i * 8, 34 + i * 8], [0, 1]), translate: `${clamp(frame, [20 + i * 8, 34 + i * 8], [18, 0])}px 0px`}}>
              <div style={{fontSize: 13, fontWeight: 750}}>{a}</div>
              <div style={{fontSize: 12, fontWeight: 850}}>{b}</div>
            </div>
          ))}
        </Card>
        <Card style={{padding: 18, minHeight: 244}}>
          <div style={{fontSize: 13, color: '#64748b', fontWeight: 700}}>Sales trend</div>
          <div style={{display: 'flex', alignItems: 'end', gap: 8, height: 156, marginTop: 12}}>
            {bars.map((h, i) => (
              <div key={i} style={{flex: 1, height: `${clamp(frame, [12 + i * 3, 35 + i * 3], [8, h])}%`, borderRadius: 7, background: i === bars.length - 1 ? '#059669' : '#d1fae5'}} />
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
};

const SalesScreen = () => {
  const frame = useCurrentFrame() - 95;
  const drawer = clamp(frame, [42, 67], [390, 0]);
  const posted = clamp(frame, [108, 125], [0, 1]);
  return (
    <div style={{padding: 24, height: '100%', color: '#0f172a', position: 'relative', overflow: 'hidden'}}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
        <div><div style={{fontSize: 12, color: '#64748b'}}>Sales</div><div style={{fontSize: 28, fontWeight: 850, marginTop: 3}}>Invoices & orders</div></div>
        <div style={{background: '#059669', color: '#fff', padding: '11px 15px', borderRadius: 12, fontSize: 13, fontWeight: 850, boxShadow: '0 10px 24px rgba(5,150,105,.2)'}}>+ New sale</div>
      </div>
      <Card style={{marginTop: 17, overflow: 'hidden'}}>
        <div style={{display: 'grid', gridTemplateColumns: '1.1fr 1fr .8fr .7fr', padding: '12px 16px', background: '#f8fafc', fontSize: 11, color: '#64748b', fontWeight: 800}}><div>Invoice</div><div>Customer</div><div>Total</div><div>Status</div></div>
        {[
          ['INV-24091', 'Atlas Engineering', 'PKR 84,500', 'Posted'],
          ['INV-24090', 'Metro Traders', 'PKR 126,000', 'Posted'],
          ['INV-24089', 'Prime Auto Parts', 'PKR 51,300', 'Partial'],
          ['INV-24088', 'United Works', 'PKR 218,700', 'Posted'],
        ].map((r, i) => (
          <div key={r[0]} style={{display: 'grid', gridTemplateColumns: '1.1fr 1fr .8fr .7fr', padding: '15px 16px', borderTop: '1px solid #eef2f7', fontSize: 12, alignItems: 'center', opacity: clamp(frame, [4 + i * 5, 17 + i * 5], [0, 1])}}>
            <div style={{fontWeight: 800}}>{r[0]}</div><div>{r[1]}</div><div style={{fontWeight: 800}}>{r[2]}</div><div style={{color: r[3] === 'Partial' ? '#b45309' : '#047857', fontWeight: 800}}>{r[3]}</div>
          </div>
        ))}
      </Card>
      <div style={{position: 'absolute', top: 0, right: 0, bottom: 0, width: 390, background: '#fff', borderLeft: '1px solid #e5e7eb', boxShadow: '-24px 0 60px rgba(15,23,42,.12)', translate: `${drawer}px 0px`, padding: 22}}>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}><div style={{fontSize: 22, fontWeight: 850}}>New sale</div><div style={{fontSize: 11, color: '#64748b'}}>Draft</div></div>
        <div style={{fontSize: 11, color: '#64748b', marginTop: 19}}>Customer</div>
        <div style={{border: '1px solid #dbe2ea', borderRadius: 11, padding: '11px 12px', fontSize: 13, marginTop: 6, fontWeight: 750}}>Atlas Engineering</div>
        <div style={{fontSize: 11, color: '#64748b', marginTop: 17}}>Product</div>
        <div style={{border: '1px solid #dbe2ea', borderRadius: 11, padding: '11px 12px', fontSize: 13, marginTop: 6}}>Front Hub Full Floating</div>
        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9, marginTop: 12}}>
          <div><div style={{fontSize: 10, color: '#94a3b8'}}>Qty</div><div style={{border: '1px solid #dbe2ea', borderRadius: 10, padding: '10px', marginTop: 5, fontWeight: 800}}>1</div></div>
          <div><div style={{fontSize: 10, color: '#94a3b8'}}>Rate</div><div style={{border: '1px solid #dbe2ea', borderRadius: 10, padding: '10px', marginTop: 5, fontWeight: 800}}>84,500</div></div>
        </div>
        <div style={{display: 'flex', justifyContent: 'space-between', marginTop: 22, paddingTop: 16, borderTop: '1px solid #eef2f7'}}><div style={{fontSize: 12, color: '#64748b'}}>Grand total</div><div style={{fontSize: 20, fontWeight: 900}}>PKR 84,500</div></div>
        <div style={{background: '#059669', color: '#fff', textAlign: 'center', borderRadius: 12, padding: '12px', marginTop: 18, fontSize: 13, fontWeight: 900, scale: clamp(frame, [92, 99, 106], [1, .96, 1])}}>Post sale</div>
      </div>
      <div style={{position: 'absolute', right: 18, bottom: 18, borderRadius: 13, background: '#052e2b', color: '#d1fae5', padding: '12px 15px', boxShadow: '0 16px 34px rgba(0,0,0,.22)', opacity: posted, translate: `0px ${clamp(frame, [108, 125], [18, 0])}px`, fontSize: 12, fontWeight: 850}}>✓ Sale posted • INV-24092</div>
    </div>
  );
};

const InventoryScreen = () => {
  const frame = useCurrentFrame() - 245;
  const stock = Math.round(clamp(frame, [48, 86], [128, 127]));
  const movement = clamp(frame, [58, 82], [0, 1]);
  return (
    <div style={{padding: 24, height: '100%', color: '#0f172a'}}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}><div><div style={{fontSize: 12, color: '#64748b'}}>Inventory</div><div style={{fontSize: 28, fontWeight: 850, marginTop: 3}}>Warehouse stock</div></div><div style={{fontSize: 12, padding: '9px 12px', border: '1px solid #dbe2ea', borderRadius: 11, fontWeight: 800}}>Main Warehouse ▾</div></div>
      <div style={{display: 'grid', gridTemplateColumns: '1.2fr .8fr', gap: 14, marginTop: 17}}>
        <Card style={{padding: 20, minHeight: 242}}>
          <div style={{display: 'flex', justifyContent: 'space-between'}}><div><div style={{fontSize: 11, color: '#64748b'}}>PRODUCT</div><div style={{fontSize: 19, fontWeight: 850, marginTop: 5}}>Front Hub Full Floating</div><div style={{fontSize: 11, color: '#94a3b8', marginTop: 4}}>SKU FH-FF-001</div></div><div style={{background: '#ecfdf5', color: '#047857', borderRadius: 999, padding: '8px 11px', height: 31, fontSize: 11, fontWeight: 850}}>In stock</div></div>
          <div style={{display: 'flex', alignItems: 'end', gap: 10, marginTop: 38}}><div style={{fontSize: 72, letterSpacing: -4, fontWeight: 900, color: '#071821'}}>{stock}</div><div style={{fontSize: 16, color: '#64748b', paddingBottom: 12}}>pieces</div></div>
          <div style={{height: 8, background: '#e5e7eb', borderRadius: 99, overflow: 'hidden', marginTop: 9}}><div style={{height: '100%', width: `${stock / 1.6}%`, background: 'linear-gradient(90deg,#10b981,#059669)', borderRadius: 99}} /></div>
        </Card>
        <Card style={{padding: 18}}>
          <div style={{fontSize: 12, color: '#64748b'}}>Warehouse split</div>
          {[['Main', 92], ['Secondary', 35]].map(([name, qty], i) => <div key={name} style={{marginTop: 20}}><div style={{display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 800}}><span>{name}</span><span>{qty}</span></div><div style={{height: 7, background: '#eef2f7', borderRadius: 99, marginTop: 8}}><div style={{height: '100%', width: `${Number(qty) / 1.3}%`, background: i === 0 ? '#059669' : '#14b8a6', borderRadius: 99}} /></div></div>)}
        </Card>
      </div>
      <Card style={{marginTop: 14, padding: 18}}>
        <div style={{display: 'flex', justifyContent: 'space-between'}}><div style={{fontSize: 14, fontWeight: 850}}>Latest stock movement</div><div style={{fontSize: 11, color: '#64748b'}}>Live audit trail</div></div>
        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr .7fr .8fr', marginTop: 15, fontSize: 11, color: '#64748b'}}><div>Reference</div><div>Movement</div><div>Qty</div><div>Warehouse</div></div>
        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr .7fr .8fr', paddingTop: 13, marginTop: 8, borderTop: '1px solid #eef2f7', fontSize: 12, opacity: movement, translate: `${clamp(frame, [58, 82], [28, 0])}px 0px`}}><div style={{fontWeight: 850}}>INV-24092</div><div>Sale posted</div><div style={{color: '#dc2626', fontWeight: 850}}>-1</div><div>Main</div></div>
      </Card>
    </div>
  );
};

const CustomerScreen = () => {
  const frame = useCurrentFrame() - 395;
  const balance = clamp(frame, [64, 103], [184500, 100000]);
  const receipt = clamp(frame, [56, 76], [0, 1]);
  return (
    <div style={{padding: 24, height: '100%', color: '#0f172a'}}>
      <div style={{fontSize: 12, color: '#64748b'}}>Customers / Atlas Engineering</div>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'end', marginTop: 4}}><div><div style={{fontSize: 28, fontWeight: 850}}>Customer khata</div><div style={{fontSize: 12, color: '#64748b', marginTop: 3}}>Credit sales, receipts and balance in one account.</div></div><div style={{background: '#059669', color: '#fff', padding: '10px 13px', borderRadius: 11, fontSize: 12, fontWeight: 850}}>Record receipt</div></div>
      <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 11, marginTop: 18}}><Kpi label="Outstanding" value={money(balance)} tone="#b45309" /><Kpi label="Credit limit" value="PKR 500,000" /><Kpi label="Credit days" value="30 days" /></div>
      <Card style={{padding: 18, marginTop: 14}}>
        <div style={{display: 'flex', justifyContent: 'space-between'}}><div style={{fontSize: 14, fontWeight: 850}}>Account activity</div><div style={{fontSize: 11, color: '#64748b'}}>Running balance</div></div>
        {[
          ['INV-24092', 'Sale', '+84,500', '184,500'],
          ['RCPT-8914', 'Receipt', '-84,500', '100,000'],
          ['INV-23972', 'Sale', '+100,000', '100,000'],
        ].map((r, i) => (
          <div key={r[0]} style={{display: 'grid', gridTemplateColumns: '1fr .7fr .7fr .8fr', borderTop: '1px solid #eef2f7', padding: '14px 0', marginTop: i === 0 ? 13 : 0, fontSize: 12, opacity: i === 1 ? receipt : 1, translate: i === 1 ? `${clamp(frame, [56, 76], [22, 0])}px 0px` : '0px 0px'}}><div style={{fontWeight: 850}}>{r[0]}</div><div>{r[1]}</div><div style={{fontWeight: 850, color: r[2].startsWith('-') ? '#047857' : '#0f172a'}}>{r[2]}</div><div style={{fontWeight: 850}}>{r[3]}</div></div>
        ))}
      </Card>
      <div style={{marginTop: 14, borderRadius: 16, border: '1px solid #a7f3d0', background: '#ecfdf5', padding: '15px 16px', opacity: receipt}}><div style={{fontSize: 11, color: '#047857', fontWeight: 900, letterSpacing: 1}}>RECEIPT POSTED</div><div style={{fontSize: 15, fontWeight: 850, marginTop: 4}}>Khata updated to PKR 100,000</div></div>
    </div>
  );
};

const PurchaseScreen = () => {
  const frame = useCurrentFrame() - 525;
  const progress = clamp(frame, [38, 106], [0, 1]);
  const stock = Math.round(clamp(frame, [78, 112], [127, 135]));
  return (
    <div style={{padding: 24, height: '100%', color: '#0f172a'}}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}><div><div style={{fontSize: 12, color: '#64748b'}}>Purchases</div><div style={{fontSize: 28, fontWeight: 850, marginTop: 3}}>PO → GRN → stock</div></div><div style={{fontSize: 12, background: '#f1f5f9', padding: '9px 12px', borderRadius: 10, fontWeight: 800}}>PO-1042</div></div>
      <Card style={{padding: 20, marginTop: 18}}>
        <div style={{display: 'flex', justifyContent: 'space-between'}}><div><div style={{fontSize: 11, color: '#64748b'}}>SUPPLIER</div><div style={{fontSize: 18, fontWeight: 850, marginTop: 4}}>Alpha Metals</div></div><div style={{fontSize: 12, color: '#b45309', fontWeight: 850}}>Awaiting receipt</div></div>
        <div style={{display: 'grid', gridTemplateColumns: '1.4fr .5fr .7fr .7fr', marginTop: 20, fontSize: 11, color: '#64748b'}}><div>Item</div><div>Qty</div><div>Rate</div><div>Total</div></div>
        <div style={{display: 'grid', gridTemplateColumns: '1.4fr .5fr .7fr .7fr', paddingTop: 13, marginTop: 8, borderTop: '1px solid #eef2f7', fontSize: 12}}><div style={{fontWeight: 850}}>Front Hub Full Floating</div><div>8</div><div>32,000</div><div style={{fontWeight: 850}}>256,000</div></div>
      </Card>
      <div style={{display: 'flex', alignItems: 'center', gap: 9, margin: '19px 6px'}}>
        {['PO approved', 'Goods received', 'Stock updated', 'Payable created'].map((label, i) => {
          const reached = progress >= i / 3;
          return <React.Fragment key={label}><div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 110}}><div style={{width: 28, height: 28, borderRadius: '50%', display: 'grid', placeItems: 'center', background: reached ? '#059669' : '#e2e8f0', color: '#fff', fontSize: 12, fontWeight: 900}}>{reached ? '✓' : i + 1}</div><div style={{fontSize: 10, color: reached ? '#047857' : '#94a3b8', fontWeight: 800, textAlign: 'center'}}>{label}</div></div>{i < 3 && <div style={{height: 2, flex: 1, background: '#e2e8f0', overflow: 'hidden'}}><div style={{height: '100%', width: `${clamp(progress, [i / 3, (i + 1) / 3], [0, 100])}%`, background: '#10b981'}} /></div>}</React.Fragment>;
        })}
      </div>
      <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12}}><Kpi label="Stock after GRN" value={`${stock} pieces`} tone="#047857" /><Kpi label="Supplier payable" value="PKR 256,000" /></div>
    </div>
  );
};

const ReportsScreen = () => {
  const frame = useCurrentFrame() - 660;
  return (
    <div style={{padding: 24, height: '100%', color: '#0f172a'}}>
      <div><div style={{fontSize: 12, color: '#64748b'}}>Reports & action center</div><div style={{fontSize: 28, fontWeight: 850, marginTop: 3}}>Aaj ka Munshi</div></div>
      <div style={{display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginTop: 17}}><Kpi label="Today sales" value="PKR 428k" /><Kpi label="Received today" value="PKR 216k" tone="#047857" /><Kpi label="Collection queue" value="PKR 390k" /><Kpi label="Low stock" value="7 products" tone="#b45309" /></div>
      <Card style={{marginTop: 13, padding: 18, background: 'linear-gradient(90deg,#ecfdf5,#fff 55%)', borderColor: '#a7f3d0'}}>
        <div style={{fontSize: 11, color: '#047857', fontWeight: 900, letterSpacing: 1.5}}>PRIORITIZED WORKLIST</div><div style={{fontSize: 19, fontWeight: 850, marginTop: 4}}>4 things need attention today</div>
        {[
          ['Collect overdue account', 'PKR 145,000', '#fee2e2'],
          ['Low stock needs reorder', '3 products', '#fef3c7'],
          ['Review aged supplier balance', 'PKR 320,000', '#dbeafe'],
        ].map((r, i) => <div key={r[0]} style={{display: 'flex', justifyContent: 'space-between', padding: '12px 13px', borderRadius: 11, background: r[2], marginTop: 9, fontSize: 12, opacity: clamp(frame, [15 + i * 10, 34 + i * 10], [0, 1]), translate: `${clamp(frame, [15 + i * 10, 34 + i * 10], [20, 0])}px 0px`}}><span style={{fontWeight: 800}}>{r[0]}</span><span style={{fontWeight: 900}}>{r[1]}</span></div>)}
      </Card>
      <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 11, marginTop: 13}}>{['Aging', 'P&L', 'Stock movement'].map((label, i) => <Card key={label} style={{padding: 16, opacity: clamp(frame, [54 + i * 8, 72 + i * 8], [0, 1]), translate: `0px ${clamp(frame, [54 + i * 8, 72 + i * 8], [18, 0])}px`}}><div style={{fontSize: 11, color: '#64748b'}}>Report</div><div style={{fontSize: 15, fontWeight: 850, marginTop: 5}}>{label}</div><div style={{height: 6, borderRadius: 99, background: '#e2e8f0', marginTop: 17}}><div style={{height: '100%', width: `${60 + i * 12}%`, background: '#10b981', borderRadius: 99}} /></div></Card>)}</div>
    </div>
  );
};

const ControlsScreen = () => {
  const frame = useCurrentFrame() - 795;
  const rows = [
    ['Roles & permissions', 'Control what each person can view and change.'],
    ['Workspace isolation', 'Keep business data scoped to the right workspace.'],
    ['Audit trails', 'Trace important financial and stock actions.'],
    ['Safe reversals', 'Correct posted workflows without silently deleting history.'],
    ['FBR integration controls', 'Configure readiness and credentials before enabled transmission.'],
  ];
  return (
    <div style={{padding: 24, height: '100%', color: '#0f172a'}}>
      <div><div style={{fontSize: 12, color: '#64748b'}}>Settings / Controls</div><div style={{fontSize: 28, fontWeight: 850, marginTop: 3}}>Built for controlled operations</div></div>
      <Card style={{marginTop: 17, overflow: 'hidden'}}>
        {rows.map((r, i) => (
          <div key={r[0]} style={{display: 'grid', gridTemplateColumns: '42px 1fr 52px', gap: 12, alignItems: 'center', padding: '15px 17px', borderTop: i ? '1px solid #eef2f7' : 'none', opacity: clamp(frame, [10 + i * 10, 28 + i * 10], [0, 1]), translate: `${clamp(frame, [10 + i * 10, 28 + i * 10], [26, 0])}px 0px`}}>
            <div style={{width: 36, height: 36, borderRadius: 11, display: 'grid', placeItems: 'center', background: '#ecfdf5', color: '#047857', fontWeight: 900}}>✓</div>
            <div><div style={{fontSize: 13, fontWeight: 850}}>{r[0]}</div><div style={{fontSize: 11, color: '#64748b', marginTop: 3, lineHeight: 1.4}}>{r[1]}</div></div>
            <div style={{width: 42, height: 23, borderRadius: 999, background: i === 4 ? '#dbeafe' : '#a7f3d0', padding: 3}}><div style={{width: 17, height: 17, borderRadius: '50%', background: i === 4 ? '#3b82f6' : '#059669', translate: '19px 0px'}} /></div>
          </div>
        ))}
      </Card>
      <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11, marginTop: 13}}><Card style={{padding: 15}}><div style={{fontSize: 11, color: '#64748b'}}>Audit status</div><div style={{fontSize: 16, fontWeight: 850, marginTop: 6, color: '#047857'}}>Protected history</div></Card><Card style={{padding: 15}}><div style={{fontSize: 11, color: '#64748b'}}>FBR setup</div><div style={{fontSize: 16, fontWeight: 850, marginTop: 6, color: '#1d4ed8'}}>Configuration ready</div></Card></div>
    </div>
  );
};

const Browser = () => {
  const frame = useCurrentFrame();
  const scale = clamp(frame, [0, 48, 72, 805, 850, 910, 970], [0.72, 1.025, 1, 1, 1.025, 1, 0.62]);
  const y = clamp(frame, [0, 52, 905, 970], [250, 0, 0, 310]);
  const rotate = clamp(frame, [0, 52], [3.2, 0]);
  const opacity = clamp(frame, [0, 18, 930, 978], [0, 1, 1, 0]);
  const active = activeNav(frame);
  return (
    <div
      style={{
        position: 'absolute',
        left: 58,
        right: 58,
        top: 455,
        height: 1225,
        borderRadius: 29,
        overflow: 'hidden',
        background: '#fff',
        boxShadow: '0 46px 120px rgba(0,0,0,.48), 0 0 0 1px rgba(255,255,255,.08)',
        scale,
        translate: `0px ${y}px`,
        rotate: `${rotate}deg`,
        opacity,
        zIndex: 15,
      }}
    >
      <div style={{height: 52, display: 'flex', alignItems: 'center', borderBottom: '1px solid #e5e7eb', background: '#fbfcfb', padding: '0 17px'}}>
        <div style={{display: 'flex', gap: 7}}><span style={{width: 10, height: 10, borderRadius: '50%', background: '#ef4444'}} /><span style={{width: 10, height: 10, borderRadius: '50%', background: '#f59e0b'}} /><span style={{width: 10, height: 10, borderRadius: '50%', background: '#22c55e'}} /></div>
        <div style={{marginLeft: 14, fontSize: 11, fontWeight: 800, color: '#64748b'}}>app.munshios.pk</div>
        <div style={{marginLeft: 'auto', fontSize: 10, color: '#94a3b8'}}>Secure workspace</div>
      </div>
      <div style={{display: 'grid', gridTemplateColumns: '172px 1fr', height: 'calc(100% - 52px)'}}>
        <div style={{background: '#0c1115', color: '#cbd5e1', padding: '19px 12px', position: 'relative'}}>
          <div style={{display: 'flex', alignItems: 'center', gap: 9, padding: '0 8px 17px'}}><BrandMark size={34} /><div style={{fontSize: 15, color: '#fff', fontWeight: 850, letterSpacing: -0.4}}>MunshiOS</div></div>
          {navItems.map((item) => {
            const isActive = item === active;
            return <div key={item} style={{padding: '10px 11px', borderRadius: 10, marginTop: 3, fontSize: 11, fontWeight: isActive ? 850 : 650, color: isActive ? '#d1fae5' : '#94a3b8', background: isActive ? 'rgba(5,150,105,.18)' : 'transparent', border: isActive ? '1px solid rgba(16,185,129,.22)' : '1px solid transparent', translate: isActive ? '4px 0px' : '0px 0px'}}>{item}</div>;
          })}
          <div style={{position: 'absolute', left: 15, right: 15, bottom: 16, borderTop: '1px solid rgba(255,255,255,.08)', paddingTop: 13}}><div style={{fontSize: 10, color: '#64748b'}}>WORKSPACE</div><div style={{fontSize: 11, color: '#e2e8f0', fontWeight: 800, marginTop: 4}}>Demo Manufacturing</div></div>
        </div>
        <div style={{position: 'relative', overflow: 'hidden', background: '#f8faf9'}}>
          <ScreenLayer start={0} end={125}><DashboardScreen /></ScreenLayer>
          <ScreenLayer start={90} end={285}><SalesScreen /></ScreenLayer>
          <ScreenLayer start={245} end={435}><InventoryScreen /></ScreenLayer>
          <ScreenLayer start={395} end={570}><CustomerScreen /></ScreenLayer>
          <ScreenLayer start={525} end={715}><PurchaseScreen /></ScreenLayer>
          <ScreenLayer start={660} end={850}><ReportsScreen /></ScreenLayer>
          <ScreenLayer start={795} end={950}><ControlsScreen /></ScreenLayer>
        </div>
      </div>
    </div>
  );
};

const Cursor = () => {
  const frame = useCurrentFrame();
  const x = clamp(frame, [70, 112, 142, 188, 258, 318, 430, 548, 670, 820, 930], [820, 870, 846, 814, 585, 660, 760, 830, 704, 790, 820]);
  const y = clamp(frame, [70, 112, 142, 188, 258, 318, 430, 548, 670, 820, 930], [620, 600, 1040, 1370, 985, 1125, 1120, 960, 1030, 1050, 1200]);
  const clickPulse = Math.max(
    clamp(frame, [138, 145, 154], [0, 1, 0]),
    clamp(frame, [185, 192, 201], [0, 1, 0]),
    clamp(frame, [603, 610, 619], [0, 1, 0]),
  );
  const opacity = clamp(frame, [62, 78, 905, 930], [0, 1, 1, 0]);
  return (
    <div style={{position: 'absolute', left: x, top: y, zIndex: 60, opacity, pointerEvents: 'none'}}>
      <div style={{position: 'absolute', width: 50, height: 50, borderRadius: '50%', left: -20, top: -20, border: '2px solid rgba(16,185,129,.55)', scale: 1 + clickPulse * .5, opacity: clickPulse * .75}} />
      <svg width="34" height="44" viewBox="0 0 34 44"><path d="M3 2L30 24L18 27L24 40L17 43L11 29L3 37V2Z" fill="#071821" stroke="white" strokeWidth="2.5" strokeLinejoin="round" /></svg>
    </div>
  );
};

const WorkflowRibbon = () => {
  const frame = useCurrentFrame();
  const labels = [
    {from: 174, to: 244, text: 'Sale posted', value: 'INV-24092'},
    {from: 256, to: 360, text: 'Stock updated', value: '128 → 127'},
    {from: 406, to: 520, text: 'Khata updated', value: 'PKR 100,000'},
    {from: 575, to: 682, text: 'GRN received', value: '+8 stock'},
  ];
  return (
    <div style={{position: 'absolute', left: 72, right: 72, bottom: 92, height: 70, zIndex: 45}}>
      {labels.map((item) => {
        const opacity = clamp(frame, [item.from, item.from + 12, item.to - 12, item.to], [0, 1, 1, 0]);
        const y = clamp(frame, [item.from, item.from + 14, item.to - 12, item.to], [24, 0, 0, -20]);
        return <div key={item.text} style={{position: 'absolute', right: 0, display: 'flex', alignItems: 'center', gap: 12, border: '1px solid rgba(94,234,212,.24)', background: 'rgba(5,46,43,.9)', backdropFilter: 'blur(18px)', borderRadius: 17, padding: '13px 16px', opacity, translate: `0px ${y}px`, boxShadow: '0 18px 50px rgba(0,0,0,.28)'}}><div style={{width: 27, height: 27, borderRadius: '50%', background: '#10b981', display: 'grid', placeItems: 'center', color: '#fff', fontSize: 13, fontWeight: 900}}>✓</div><div><div style={{fontSize: 11, color: '#99f6e4', fontWeight: 900, letterSpacing: .7}}>{item.text.toUpperCase()}</div><div style={{fontSize: 16, color: '#fff', fontWeight: 850, marginTop: 2}}>{item.value}</div></div></div>;
      })}
    </div>
  );
};

const FinalLockup = () => {
  const frame = useCurrentFrame();
  const opacity = clamp(frame, [930, 965, 1030, 1049], [0, 1, 1, 0]);
  const scale = clamp(frame, [930, 972], [0.72, 1]);
  const y = clamp(frame, [930, 972], [70, 0]);
  return (
    <div style={{position: 'absolute', inset: 0, zIndex: 80, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', opacity, scale, translate: `0px ${y}px`}}>
      <div style={{width: 186, height: 186, borderRadius: 50, background: '#fff', display: 'grid', placeItems: 'center', boxShadow: '0 32px 100px rgba(0,0,0,.35)'}}><BrandMark size={142} /></div>
      <div style={{fontSize: 78, lineHeight: .98, letterSpacing: -5, color: '#fff', fontWeight: 900, marginTop: 42}}>MunshiOS</div>
      <div style={{fontSize: 31, color: '#99f6e4', fontWeight: 720, marginTop: 17}}>Run your business with clarity.</div>
      <div style={{marginTop: 34, border: '1px solid rgba(94,234,212,.32)', background: 'rgba(5,150,105,.16)', color: '#d1fae5', borderRadius: 999, padding: '14px 23px', fontSize: 15, fontWeight: 850}}>Sales · Stock · Khata · Accounting · Reports</div>
    </div>
  );
};

export const MunshiOSReelV2 = () => {
  const frame = useCurrentFrame();
  const progress = clamp(frame, [0, 1049], [0, 100]);
  return (
    <AbsoluteFill style={{fontFamily: 'Inter, ui-sans-serif, system-ui, Arial, sans-serif', overflow: 'hidden'}}>
      <Backdrop />
      <div style={{position: 'absolute', left: 0, top: 0, width: `${progress}%`, height: 4, background: 'linear-gradient(90deg,#10b981,#2dd4bf)', zIndex: 100}} />
      <Headline start={0} end={118} eyebrow="MunshiOS" title="Your business. One system." />
      <Headline start={103} end={266} eyebrow="Sales" title="Make the sale. Everything else follows." />
      <Headline start={250} end={426} eyebrow="Inventory" title="Stock moves with the transaction." />
      <Headline start={410} end={560} eyebrow="Customer khata" title="Every receipt changes the balance." />
      <Headline start={544} end={704} eyebrow="Purchasing" title="PO to GRN to stock. Connected." />
      <Headline start={688} end={842} eyebrow="Aaj ka Munshi" title="See what needs attention now." />
      <Headline start={826} end={944} eyebrow="Controls & audit" title="Keep important actions controlled." />
      <Browser />
      <Cursor />
      <WorkflowRibbon />
      <FinalLockup />
    </AbsoluteFill>
  );
};
