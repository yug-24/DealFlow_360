import { useEffect } from 'react';
import { io } from 'socket.io-client';

const SOCKET_BASE = import.meta.env.VITE_API_BASE
  ? import.meta.env.VITE_API_BASE.replace(/\/api\/?$/, '')
  : 'http://localhost:4000';

let socket = null;

function getSocket() {
  if (!socket) {
    socket = io(SOCKET_BASE, { autoConnect: true });
  }
  return socket;
}

/**
 * Joins `quotation:{id}` for the lifetime of the component and wires up
 * the four broadcast events (Architecture.md §6). The frontend never
 * computes scores locally — it only renders these broadcasts.
 */
export function useQuotationRoom(quotationId, handlers = {}) {
  useEffect(() => {
    if (!quotationId) return undefined;
    const s = getSocket();
    s.emit('join_quotation', quotationId);

    const { onScoreUpdated, onFulfillmentUpdated, onBillingUpdated, onStatusChanged } = handlers;
    if (onScoreUpdated) s.on('score_updated', onScoreUpdated);
    if (onFulfillmentUpdated) s.on('fulfillment_updated', onFulfillmentUpdated);
    if (onBillingUpdated) s.on('billing_updated', onBillingUpdated);
    if (onStatusChanged) s.on('status_changed', onStatusChanged);

    return () => {
      if (onScoreUpdated) s.off('score_updated', onScoreUpdated);
      if (onFulfillmentUpdated) s.off('fulfillment_updated', onFulfillmentUpdated);
      if (onBillingUpdated) s.off('billing_updated', onBillingUpdated);
      if (onStatusChanged) s.off('status_changed', onStatusChanged);
      s.emit('leave_quotation', quotationId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotationId]);
}

export { getSocket };
