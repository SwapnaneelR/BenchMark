export interface TradeStats {
  totalOrders: number;
  ackedOrders: number;
  rejectedOrders: number;
  fillCount: number;
  filledOrders: number;
  filledQty: number;
  volumeUsd: number;
  realizedPnl: number;
  netPosition: number;
}

export const emptyTradeStats: TradeStats = {
  totalOrders: 0,
  ackedOrders: 0,
  rejectedOrders: 0,
  fillCount: 0,
  filledOrders: 0,
  filledQty: 0,
  volumeUsd: 0,
  realizedPnl: 0,
  netPosition: 0,
};
