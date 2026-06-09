// TODO: implement price-time priority matching engine
export class OrderBook {
  processLimit(_order: { id: string; side: 'buy' | 'sell'; price: number; qty: number }) {
    throw new Error('Not implemented');
  }

  processMarket(_order: { id: string; side: 'buy' | 'sell'; qty: number }) {
    throw new Error('Not implemented');
  }

  cancel(_id: string) {
    throw new Error('Not implemented');
  }
}
