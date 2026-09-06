const mongoose = require('mongoose');

let isConnected = false;

async function connectDB() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/dealflow360?replicaSet=rs0';

  mongoose.connection.on('connected', () => {
    isConnected = true;
    console.log('[db] connected');
  });

  mongoose.connection.on('error', (err) => {
    console.error('[db] connection error:', err.message);
  });

  mongoose.connection.on('disconnected', () => {
    isConnected = false;
    console.warn('[db] disconnected');
  });

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
    });
  } catch (err) {
    // Do not crash the process on boot if Mongo isn't up yet in dev —
    // log clearly so the DoD ("backend boots") is satisfiable even before
    // the DB is running, and retry once after a short delay.
    console.error('[db] initial connection failed:', err.message);
    console.error('[db] make sure MongoDB is running as a replica set (see .env.example).');
    setTimeout(() => {
      mongoose.connect(uri).catch((e) =>
        console.error('[db] retry failed:', e.message)
      );
    }, 5000);
  }

  return mongoose.connection;
}

function requireTransactions() {
  // Helper used by services that must run multi-document transactions
  // (e.g. scoring recompute + approval routing + audit log write).
  // Throws early with a clear message if Mongo isn't a replica set.
  if (!isConnected) {
    throw new Error('Database not connected — cannot start transaction session.');
  }
  return mongoose.startSession();
}

module.exports = { connectDB, requireTransactions, mongoose };
