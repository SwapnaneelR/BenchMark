// Client → Engine

export interface NewLimit {
  type: 'NewLimit';
  id: string;
  side: 'buy' | 'sell';
  price: number;
  qty: number;
}

export interface NewMarket {
  type: 'NewMarket';
  id: string;
  side: 'buy' | 'sell';
  qty: number;
}

export interface Cancel {
  type: 'Cancel';
  id: string;
}

export type ClientMessage = NewLimit | NewMarket | Cancel;

// Engine → Client

export interface Ack {
  type: 'Ack';
  id: string;
}

export interface Fill {
  type: 'Fill';
  id: string;
  qty: number;
  price: number;
}

export interface Reject {
  type: 'Reject';
  id: string;
  reason: string;
}

export type ServerMessage = Ack | Fill | Reject;
