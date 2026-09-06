const { Schema, model } = require('mongoose');

// Internal users only (PRD.md §5 personas). Customers authenticate via
// Customer + portal magic link, kept separate per Architecture.md §2 auth note.
const userSchema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: ['SalesRep', 'SalesManager', 'Finance', 'Admin'],
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = model('User', userSchema);
