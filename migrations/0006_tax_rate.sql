-- 報價稅率與進出口。不修改 0001 到 0005。
-- 既有報價稅率為 0、進出口為空，不重算金額。

ALTER TABLE quotes ADD COLUMN tax_rate REAL NOT NULL DEFAULT 0;
ALTER TABLE quotes ADD COLUMN direction TEXT CHECK (direction IS NULL OR direction IN ('import', 'export'));
