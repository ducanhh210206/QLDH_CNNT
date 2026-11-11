import { useEffect, useRef, useState } from 'react';

export default function GatewayAlert() {
  const [message, setMessage] = useState('');
  const previous = useRef(null);
  const recoveryAt = useRef(0);
  useEffect(() => {
    let live = true;
    async function check() {
      try {
        const response = await fetch('/gateway/status', { cache: 'no-store', signal: AbortSignal.timeout(2500) });
        if (!response.ok) throw new Error('not a gateway');
        const result = await response.json();
        if (!live || result.service !== 'omdrs-auto-gateway') return;
        if (result.active === 'standby') {
          setMessage('Backend chính không sẵn sàng. Hệ thống đang dùng backend dự phòng. Yêu cầu ghi đang dở cần được kiểm tra trước khi gửi lại.');
        } else if (!result.active) {
          setMessage('Chưa có backend sẵn sàng. Hệ thống đang kiểm tra kết nối.');
        } else {
          if (previous.current === 'standby') recoveryAt.current = Date.now();
          setMessage(Date.now() - recoveryAt.current < 10000 ? 'Backend chính đã sẵn sàng và được kết nối trở lại.' : '');
        }
        previous.current = result.active;
      } catch { if (live) setMessage(''); }
    }
    check();
    const timer = setInterval(check, 3000);
    return () => { live = false; clearInterval(timer); };
  }, []);
  if (!message) return null;
  return <div role="status" aria-live="polite" style={{ position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 9999, maxWidth: 'min(90vw, 720px)', padding: '12px 18px', background: '#fff5df', color: '#513500', border: '1px solid #d9a13a', borderRadius: 10, boxShadow: '0 4px 20px #0002' }}>{message}</div>;
}
