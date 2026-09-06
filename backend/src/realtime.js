/**
 * Single point of access to the Socket.IO server instance for services
 * that need to broadcast without importing server.js (avoids a circular
 * dependency: server.js requires routes -> routes require services ->
 * services would require server.js).
 */
let io = null;

function setIo(ioInstance) {
  io = ioInstance;
}

/**
 * Broadcasts to everyone in `quotation:{id}` — the frontend never computes
 * scores locally, it only renders these broadcasts (Architecture.md §6).
 */
function emitToQuotation(quotationId, event, payload) {
  if (!io) return;
  io.to(`quotation:${quotationId}`).emit(event, payload);
}

module.exports = { setIo, emitToQuotation };
