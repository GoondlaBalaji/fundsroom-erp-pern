-- AlterTable: Add CHECK constraints to inventories table for data integrity
ALTER TABLE "inventories" ADD CONSTRAINT "chk_physical_qty_non_negative" CHECK (physical_quantity >= 0);
ALTER TABLE "inventories" ADD CONSTRAINT "chk_reserved_qty_non_negative" CHECK (reserved_quantity >= 0);
ALTER TABLE "inventories" ADD CONSTRAINT "chk_damaged_qty_non_negative" CHECK (damaged_quantity >= 0);
ALTER TABLE "inventories" ADD CONSTRAINT "chk_reserved_le_physical" CHECK (reserved_quantity <= physical_quantity);
