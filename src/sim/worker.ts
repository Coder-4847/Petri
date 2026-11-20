import { Sim } from './sim';

const sim = new Sim((msg, transfer) => (self as any).postMessage(msg, transfer ?? []));
self.onmessage = (ev: MessageEvent) => sim.handle(ev.data);
// A short timer keeps ticks smooth; the Sim itself uses wall-clock accumulation.
setInterval(() => sim.loop(), 8);
(self as any).postMessage({ t: 'ready' });
