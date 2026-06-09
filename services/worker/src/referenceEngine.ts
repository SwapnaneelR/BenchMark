import type { ClientMessage, ServerMessage } from '@iicpc/protocol';

// TODO: minimal correct order book used to validate submission output
export class ReferenceEngine {
  validate(_orders: ClientMessage[], _actualFills: ServerMessage[]): number {
    throw new Error('Not implemented');
  }
}
