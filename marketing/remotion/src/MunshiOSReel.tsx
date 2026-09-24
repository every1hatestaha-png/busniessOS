import React from 'react';
import {
  AbsoluteFill,
  Easing,
  Sequence,
  interpolate,
  useCurrentFrame,
} from 'remotion';

const fade = (frame: number, duration: number) =>
  interpolate(frame, [0, 14, duration - 14, duration], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

const rise = (frame: number, start: number, end: number, distance = 80) =>
  interpolate(frame, [start, end], [distance, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

const appear = (frame: number, start: number, end: number) =>
  interpolate(frame, [start, end], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

const BrandMark = ({size = 170}: {size?: number}) => (
  <svg width={size} height={size} viewBox="0 0 512 512" aria-label="MunshiOS logo">
    <defs>
      <linearGradient id="navy" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#123A55" />
        <stop offset="1" stopColor="#061D2E" />
      </linearGradient>
      <linearGradient id="teal" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stopColor="#087C72" />
        <stop offset="1" stopColor="#11B79E" />
      </linearGradient>
    </defs>
    <path fill="url(#navy)" d="M68 90c0-13 15-21 26-14l162 111L418 76c11-7 26 1 26 14v61L256 279 142 201v203l-74-43V90Z" />
    <path fill="url(#teal)" d="M262 306c0-8 5-15 12-19l42-24v141h-54v-98Zm70-47c0-8 4-15 11-19l43-25v189h-54V259Zm70-47c0-8 4-15 11-19l31-18v186l-42 24V212Z" />
  </svg>
);

const Background = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#071821',
        backgroundImage:
          'radial-gradient(circle at 18% 10%, rgba(17,183,158,.16), transparent 32%), radial-gradient(circle at 85% 85%, rgba(5,150,105,.12), transparent 35%), linear-gradient(rgba(255,255,255,.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.025) 1px, transparent 1px)',
        backgroundSize: 'auto, auto, 72px 72px, 72px 72px',
        backgroundPosition: `0px 0px, 0px 0px, ${frame * 0.25}px ${frame * 0.25}px, ${frame * 0.25}px ${frame * 0.25}px`,
      }}
    />
  );
};

const Frame = ({children, duration}: {children: React.ReactNode; duration: number}) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{opacity: fade(frame, duration), fontFamily: 'Inter, Arial, sans-serif'}}>
      <Background />
      <AbsoluteFill style={{padding: '110px 82px', color: '#f8fafc'}}>{children}</AbsoluteFill>
    </AbsoluteFill>
  );
};

const Kicker = ({children}: {children: React.ReactNode}) => (
  <div
    style={{
      alignSelf: 'flex-start',
      border: '1px solid rgba(16,185,129,.38)',
      background: 'rgba(5,150,105,.12)',
      color: '#6ee7b7',
      borderRadius: 999,
      padding: '13px 20px',
      fontSize: 25,
      fontWeight: 800,
      letterSpacing: 2,
      textTransform: 'uppercase',
    }}
  >
    {children}
  </div>
);

const SceneOne = () => {
  const frame = useCurrentFrame();
  return (
    <Frame duration={150}>
      <div style={{display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center'}}>
        <div
          style={{
            opacity: appear(frame, 0, 24),
            translate: `0px ${rise(frame, 0, 24, 70)}px`,
            marginBottom: 54,
          }}
        >
          <BrandMark size={190} />
        </div>
        <div
          style={{
            fontSize: 103,
            lineHeight: 0.98,
            fontWeight: 850,
            letterSpacing: -5.5,
            maxWidth: 900,
            opacity: appear(frame, 12, 40),
            translate: `0px ${rise(frame, 12, 40, 90)}px`,
          }}
        >
          Run your entire business from one place.
        </div>
        <div
          style={{
            marginTop: 42,
            fontSize: 37,
            lineHeight: 1.35,
            color: '#a7b7bf',
            maxWidth: 840,
            opacity: appear(frame, 38, 62),
            translate: `0px ${rise(frame, 38, 62, 50)}px`,
          }}
        >
          MunshiOS connects sales, purchasing, stock, khata and accounting in one operational flow.
        </div>
      </div>
    </Frame>
  );
};

const flowItems = [
  ['01', 'Sale created', 'Your team records the transaction once.'],
  ['02', 'Stock updates', 'Warehouse quantities move with the workflow.'],
  ['03', 'Khata updates', 'Customer dues and receipts stay connected.'],
  ['04', 'Ledger stays in sync', 'Accounting follows the operational event.'],
];

const SceneTwo = () => {
  const frame = useCurrentFrame();
  return (
    <Frame duration={210}>
      <Kicker>Connected workflow</Kicker>
      <div style={{fontSize: 78, fontWeight: 830, lineHeight: 1.03, letterSpacing: -3.7, marginTop: 34}}>
        One action. The rest of the business follows.
      </div>
      <div style={{position: 'relative', marginTop: 75, display: 'flex', flexDirection: 'column', gap: 28}}>
        <div style={{position: 'absolute', left: 45, top: 34, bottom: 34, width: 3, background: 'linear-gradient(#10b981,#155e75)', opacity: .7}} />
        {flowItems.map(([n, title, copy], i) => {
          const start = 28 + i * 28;
          return (
            <div
              key={title}
              style={{
                display: 'grid',
                gridTemplateColumns: '90px 1fr',
                gap: 28,
                alignItems: 'center',
                opacity: appear(frame, start, start + 20),
                translate: `${rise(frame, start, start + 20, 55)}px 0px`,
              }}
            >
              <div style={{width: 90, height: 90, borderRadius: 28, background: '#0f2b34', border: '1px solid rgba(110,231,183,.25)', display: 'grid', placeItems: 'center', color: '#6ee7b7', fontSize: 26, fontWeight: 800, zIndex: 1}}>{n}</div>
              <div style={{background: 'rgba(255,255,255,.045)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 30, padding: '28px 30px'}}>
                <div style={{fontSize: 38, fontWeight: 800}}>{title}</div>
                <div style={{marginTop: 8, fontSize: 27, color: '#9fb0b8', lineHeight: 1.35}}>{copy}</div>
              </div>
            </div>
          );
        })}
      </div>
    </Frame>
  );
};

const modules = [
  ['Inventory & warehouses', 'Live stock • movements • transfers'],
  ['Purchases & GRN', 'PO • receiving • supplier balances'],
  ['Sales & customer accounts', 'Credit • receipts • returns • khata'],
  ['Accounting', 'Cash • bank • expenses • ledgers'],
];

const SceneThree = () => {
  const frame = useCurrentFrame();
  return (
    <Frame duration={180}>
      <Kicker>Core modules</Kicker>
      <div style={{fontSize: 82, fontWeight: 830, lineHeight: 1, letterSpacing: -4, marginTop: 34, maxWidth: 890}}>
        The work your business does every day.
      </div>
      <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 76}}>
        {modules.map(([title, copy], i) => {
          const start = 30 + i * 18;
          return (
            <div
              key={title}
              style={{
                minHeight: 310,
                borderRadius: 34,
                padding: 34,
                background: i === 0 ? 'linear-gradient(145deg, rgba(16,185,129,.2), rgba(255,255,255,.045))' : 'rgba(255,255,255,.05)',
                border: '1px solid rgba(255,255,255,.09)',
                opacity: appear(frame, start, start + 20),
                translate: `0px ${rise(frame, start, start + 20, 70)}px`,
              }}
            >
              <div style={{width: 64, height: 64, borderRadius: 20, background: '#0b3a39', color: '#6ee7b7', display: 'grid', placeItems: 'center', fontSize: 26, fontWeight: 900}}>{String(i + 1).padStart(2, '0')}</div>
              <div style={{fontSize: 36, lineHeight: 1.1, fontWeight: 800, marginTop: 54}}>{title}</div>
              <div style={{fontSize: 24, lineHeight: 1.45, color: '#9fb0b8', marginTop: 18}}>{copy}</div>
            </div>
          );
        })}
      </div>
    </Frame>
  );
};

const SceneFour = () => {
  const frame = useCurrentFrame();
  const cards = ['Aaj ka Munshi', 'Aging', 'P&L', 'Stock movement'];
  return (
    <Frame duration={180}>
      <Kicker>Reports & action center</Kicker>
      <div style={{fontSize: 84, fontWeight: 830, lineHeight: 1, letterSpacing: -4, marginTop: 34}}>
        See what needs attention.
      </div>
      <div style={{marginTop: 70, borderRadius: 38, padding: 34, background: '#f7faf9', color: '#0f172a', boxShadow: '0 40px 100px rgba(0,0,0,.3)', opacity: appear(frame, 20, 44), translate: `0px ${rise(frame, 20, 44, 70)}px`}}>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
          <div>
            <div style={{fontSize: 23, color: '#64748b', fontWeight: 700}}>MUNSHIOS</div>
            <div style={{fontSize: 42, fontWeight: 850, marginTop: 4}}>Action center</div>
          </div>
          <div style={{borderRadius: 999, padding: '12px 18px', background: '#dcfce7', color: '#047857', fontSize: 22, fontWeight: 800}}>Live overview</div>
        </div>
        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginTop: 32}}>
          {cards.map((label, i) => (
            <div key={label} style={{borderRadius: 26, padding: 26, background: i === 0 ? '#ecfdf5' : '#ffffff', border: '1px solid #e2e8f0', opacity: appear(frame, 48 + i * 14, 64 + i * 14)}}>
              <div style={{fontSize: 23, color: '#64748b'}}>Report</div>
              <div style={{fontSize: 31, fontWeight: 800, marginTop: 8}}>{label}</div>
              <div style={{height: 8, background: '#e2e8f0', borderRadius: 99, marginTop: 30, overflow: 'hidden'}}>
                <div style={{height: '100%', width: `${55 + i * 10}%`, background: '#10b981', borderRadius: 99}} />
              </div>
            </div>
          ))}
        </div>
        <div style={{marginTop: 22, padding: 24, borderRadius: 26, background: '#071821', color: '#e2e8f0'}}>
          <div style={{fontSize: 22, color: '#6ee7b7', fontWeight: 800}}>OPERATIONAL ALERT</div>
          <div style={{fontSize: 29, marginTop: 7, fontWeight: 750}}>Keep stock, dues and cash visibility in the same system.</div>
        </div>
      </div>
    </Frame>
  );
};

const SceneFive = () => {
  const frame = useCurrentFrame();
  const chips = ['Roles & permissions', 'Workspace isolation', 'Audit trails', 'Safe reversals', 'FBR integration controls'];
  return (
    <Frame duration={120}>
      <Kicker>Controls & audit</Kicker>
      <div style={{fontSize: 86, fontWeight: 830, lineHeight: 1, letterSpacing: -4.3, marginTop: 34, maxWidth: 860}}>
        Built to keep business actions controlled.
      </div>
      <div style={{display: 'flex', flexWrap: 'wrap', gap: 18, marginTop: 72}}>
        {chips.map((chip, i) => (
          <div key={chip} style={{fontSize: 30, fontWeight: 760, padding: '25px 28px', borderRadius: 24, background: 'rgba(255,255,255,.055)', border: '1px solid rgba(110,231,183,.17)', opacity: appear(frame, 20 + i * 12, 36 + i * 12), translate: `0px ${rise(frame, 20 + i * 12, 36 + i * 12, 35)}px`}}>
            <span style={{color: '#34d399', marginRight: 14}}>✓</span>{chip}
          </div>
        ))}
      </div>
    </Frame>
  );
};

const SceneSix = () => {
  const frame = useCurrentFrame();
  return (
    <Frame duration={60}>
      <div style={{display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center', alignItems: 'center', textAlign: 'center'}}>
        <div style={{opacity: appear(frame, 0, 14), scale: interpolate(frame, [0, 18], [0.84, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.16, 1, 0.3, 1)})}}>
          <BrandMark size={180} />
        </div>
        <div style={{fontSize: 112, fontWeight: 900, letterSpacing: -6, marginTop: 28, opacity: appear(frame, 7, 22)}}>MunshiOS</div>
        <div style={{fontSize: 40, lineHeight: 1.3, color: '#a7b7bf', maxWidth: 750, marginTop: 18, opacity: appear(frame, 15, 28)}}>Business software for Pakistan.</div>
        <div style={{marginTop: 48, borderRadius: 22, background: '#059669', color: 'white', padding: '22px 38px', fontSize: 31, fontWeight: 850, opacity: appear(frame, 24, 38)}}>Get your Munshi</div>
      </div>
    </Frame>
  );
};

export const MunshiOSReel = () => {
  return (
    <AbsoluteFill style={{backgroundColor: '#071821'}}>
      <Sequence from={0} durationInFrames={150} name="Hook"><SceneOne /></Sequence>
      <Sequence from={150} durationInFrames={210} name="Connected workflow"><SceneTwo /></Sequence>
      <Sequence from={360} durationInFrames={180} name="Core modules"><SceneThree /></Sequence>
      <Sequence from={540} durationInFrames={180} name="Reports"><SceneFour /></Sequence>
      <Sequence from={720} durationInFrames={120} name="Controls"><SceneFive /></Sequence>
      <Sequence from={840} durationInFrames={60} name="CTA"><SceneSix /></Sequence>
    </AbsoluteFill>
  );
};
