const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be configured with at least 32 characters.');
}

// Simple role-claim JWT auth (Architecture.md §2). Internal roles +
// customer/portal role are both encoded in the token's `role` claim.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Missing authorization token.' });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient role for this action.' });
    }
    next();
  };
}

/** Signs a JWT for an internal User doc ('SalesRep'|'SalesManager'|'Finance'|'Admin') or a Customer ('Customer'). */
function signToken(subject, role) {
  return jwt.sign(
    { id: subject._id, role, name: subject.name },
    JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
}

module.exports = { requireAuth, requireRole, signToken };
