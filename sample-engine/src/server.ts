import { WebSocketServer } from 'ws';
import { OrderBook } from './orderbook';

const port = parseInt(process.env.PORT ?? '9000');
const wss = new WebSocketServer({ port });
const book = new OrderBook();

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    let msg: any;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    if (msg.type === 'NewLimit') {
      const fills = book.processLimit({ id: msg.id, side: msg.side, price: msg.price, qty: msg.qty });
      ws.send(JSON.stringify({ type: 'Ack', id: msg.id }));
      for (const fill of fills) {
        ws.send(JSON.stringify({ type: 'Fill', id: msg.id, price: fill.price, qty: fill.qty }));
      }
    } else if (msg.type === 'NewMarket') {
      const fills = book.processMarket({ id: msg.id, side: msg.side, qty: msg.qty });
      if (!fills) {
        ws.send(JSON.stringify({ type: 'Reject', id: msg.id, reason: 'No liquidity' }));
      } else {
        ws.send(JSON.stringify({ type: 'Ack', id: msg.id }));
        for (const fill of fills) {
          ws.send(JSON.stringify({ type: 'Fill', id: msg.id, price: fill.price, qty: fill.qty }));
        }
      }
    } else if (msg.type === 'Cancel') {
      const ok = book.cancel(msg.id);
      if (ok) {
        ws.send(JSON.stringify({ type: 'Ack', id: msg.id }));
      } else {
        ws.send(JSON.stringify({ type: 'Reject', id: msg.id, reason: 'Order not found' }));
      }
    }
  });

  ws.on('error', (err) => console.error('ws error:', err.message));
});

console.log(`Sample engine listening on ws://0.0.0.0:${port}`);
