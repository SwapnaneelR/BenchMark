import { WebSocketServer } from 'ws';
import { OrderBook } from './orderbook';

const wss = new WebSocketServer({ port: 9000 });
const book = new OrderBook();

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    // TODO: route to book.processLimit / processMarket / cancel
    // send responses back via ws.send(JSON.stringify(...))
    console.log('received', msg);
  });
});

console.log('Sample engine listening on ws://0.0.0.0:9000');
