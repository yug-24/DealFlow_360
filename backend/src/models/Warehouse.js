const { Schema, model } = require('mongoose');

const warehouseSchema = new Schema(
  {
    name: { type: String, required: true },
    shippingWeight: { type: Number, default: 1 }, // shipping-cost weight factor
  },
  { timestamps: true }
);

module.exports = model('Warehouse', warehouseSchema);
