const { Schema, model, Types } = require('mongoose');

const stockLevelSchema = new Schema(
  {
    warehouseId: { type: Types.ObjectId, ref: 'Warehouse', required: true },
    productId: { type: Types.ObjectId, ref: 'Product', required: true },
    qtyAvailable: { type: Number, required: true, default: 0 },
    qtyReserved: { type: Number, required: true, default: 0 },
  },
  { timestamps: true, optimisticConcurrency: true } // guards against oversell on concurrent allocation
);

stockLevelSchema.index({ warehouseId: 1, productId: 1 }, { unique: true });

module.exports = model('StockLevel', stockLevelSchema);
