import type { ClientMessage } from '@iicpc/protocol';

interface OrderEntry {
  id: string;
  side: 'buy' | 'sell';
  price: number;
  remaining: number;
  seq: number;
}

interface Fill { price: number; qty: number; }

export interface RunResult {
  requestId: string;
  fills: Fill[];
  rejected: boolean;
}

class RefBook {
  private buys: OrderEntry[] = [];
  private sells: OrderEntry[] = [];
  private orderMap = new Map<string, OrderEntry>();
  private seq = 0;

  processLimit(order: { id: string; side: 'buy' | 'sell'; price: number; qty: number }): Fill[] {
    const entry: OrderEntry = { id: order.id, side: order.side, price: order.price, remaining: order.qty, seq: this.seq++ };
    this.orderMap.set(order.id, entry);
    const fills: Fill[] = [];

    if (order.side === 'buy') {
      this.sells.sort((a, b) => a.price - b.price || a.seq - b.seq);
      let i = 0;
      while (i < this.sells.length && entry.remaining > 0 && this.sells[i].price <= order.price) {
        const maker = this.sells[i];
        const qty = Math.min(entry.remaining, maker.remaining);
        fills.push({ price: maker.price, qty });
        entry.remaining -= qty;
        maker.remaining -= qty;
        if (maker.remaining === 0) { this.orderMap.delete(maker.id); this.sells.splice(i, 1); }
        else i++;
      }
    } else {
      this.buys.sort((a, b) => b.price - a.price || a.seq - b.seq);
      let i = 0;
      while (i < this.buys.length && entry.remaining > 0 && this.buys[i].price >= order.price) {
        const maker = this.buys[i];
        const qty = Math.min(entry.remaining, maker.remaining);
        fills.push({ price: maker.price, qty });
        entry.remaining -= qty;
        maker.remaining -= qty;
        if (maker.remaining === 0) { this.orderMap.delete(maker.id); this.buys.splice(i, 1); }
        else i++;
      }
    }

    if (entry.remaining > 0) {
      if (order.side === 'buy') this.buys.push(entry);
      else this.sells.push(entry);
    } else {
      this.orderMap.delete(order.id);
    }
    return fills;
  }

  processMarket(order: { id: string; side: 'buy' | 'sell'; qty: number }): Fill[] | null {
    if (order.side === 'buy' && this.sells.length === 0) return null;
    if (order.side === 'sell' && this.buys.length === 0) return null;
    const fills: Fill[] = [];
    let remaining = order.qty;

    if (order.side === 'buy') {
      this.sells.sort((a, b) => a.price - b.price || a.seq - b.seq);
      let i = 0;
      while (i < this.sells.length && remaining > 0) {
        const maker = this.sells[i];
        const qty = Math.min(remaining, maker.remaining);
        fills.push({ price: maker.price, qty });
        remaining -= qty;
        maker.remaining -= qty;
        if (maker.remaining === 0) { this.orderMap.delete(maker.id); this.sells.splice(i, 1); }
        else i++;
      }
    } else {
      this.buys.sort((a, b) => b.price - a.price || a.seq - b.seq);
      let i = 0;
      while (i < this.buys.length && remaining > 0) {
        const maker = this.buys[i];
        const qty = Math.min(remaining, maker.remaining);
        fills.push({ price: maker.price, qty });
        remaining -= qty;
        maker.remaining -= qty;
        if (maker.remaining === 0) { this.orderMap.delete(maker.id); this.buys.splice(i, 1); }
        else i++;
      }
    }
    return fills.length > 0 ? fills : null;
  }

  cancel(id: string): boolean {
    const order = this.orderMap.get(id);
    if (!order) return false;
    this.orderMap.delete(id);
    if (order.side === 'buy') this.buys = this.buys.filter(o => o.id !== id);
    else this.sells = this.sells.filter(o => o.id !== id);
    return true;
  }
}

export class ReferenceEngine {
  processAll(orders: ClientMessage[]): RunResult[] {
    const book = new RefBook();
    return orders.map((order) => {
      if (order.type === 'NewLimit') {
        const fills = book.processLimit({ id: order.id, side: order.side, price: order.price, qty: order.qty });
        return { requestId: order.id, fills, rejected: false };
      } else if (order.type === 'NewMarket') {
        const fills = book.processMarket({ id: order.id, side: order.side, qty: order.qty });
        return fills ? { requestId: order.id, fills, rejected: false } : { requestId: order.id, fills: [], rejected: true };
      } else {
        const ok = book.cancel(order.id);
        return { requestId: order.id, fills: [], rejected: !ok };
      }
    });
  }

  validate(orders: ClientMessage[], actual: RunResult[]): number {
    const expected = this.processAll(orders);
    let correct = 0;
    const n = Math.min(expected.length, actual.length);
    for (let i = 0; i < n; i++) {
      const exp = expected[i];
      const act = actual[i];
      if (exp.rejected !== act.rejected) continue;
      if (exp.rejected) { correct++; continue; }
      const expQty = exp.fills.reduce((s, f) => s + f.qty, 0);
      const actQty = act.fills.reduce((s, f) => s + f.qty, 0);
      if (expQty !== actQty) continue;
      const expVal = exp.fills.reduce((s, f) => s + f.price * f.qty, 0);
      const actVal = act.fills.reduce((s, f) => s + f.price * f.qty, 0);
      if (Math.abs(expVal - actVal) < 1) correct++;
    }
    return n > 0 ? correct / n : 0;
  }
}
