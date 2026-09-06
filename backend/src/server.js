require('dotenv').config();
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be configured with at least 32 characters.');
}
const express = require('express');
const http = require('http');
const cors = require('cors');
const morgan = require('morgan');
const { Server } = require('socket.io');

const { connectDB } = require('./config/db');
const routes = require('./routes');
const { setIo } = require('./realtime');

const app = express();
const server = http.createServer(app);

app.disable('x-powered-by');

const io = new Server(server, {
  cors: { origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' },
});

// Real-time sync design (Architecture.md §6): one room per quotation.
// Mutations broadcast `score_updated` with the new ScoreSnapshot to
// everyone in `quotation:{id}` — implemented from Phase 5 onward.
io.on('connection', (socket) => {
  socket.on('join_quotation', (quotationId) => {
    socket.join(`quotation:${quotationId}`);
  });
  socket.on('leave_quotation', (quotationId) => {
    socket.leave(`quotation:${quotationId}`);
  });
});

app.set('io', io); // services can emit via req.app.get('io')
setIo(io); // also available to services via src/realtime.js (no circular import)

const allowedOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
app.use(cors({ origin: allowedOrigin, credentials: false }));
app.use(express.json({ limit: '100kb' }));
app.use(morgan('dev'));

app.use('/api', routes);

app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || 400;
  res.status(status).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 4000;

async function start() {
  await connectDB();
  server.listen(PORT, () => {
    console.log(`[server] DealFlow360 backend listening on :${PORT}`);
  });
}

start();

module.exports = { app, server, io };
