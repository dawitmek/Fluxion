import { useEffect, useState } from 'react';

export function App() {
  const [status, setStatus] = useState('checking server…');

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((body: { protocol: number }) => setStatus(`server ok · protocol v${body.protocol}`))
      .catch(() => setStatus('server unreachable'));
  }, []);

  return (
    <main>
      <h1>Fluxion</h1>
      <p>{status}</p>
    </main>
  );
}
