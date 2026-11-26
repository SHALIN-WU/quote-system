-- 報價、單號流水、全公司計算參數。不修改 0001 到 0003。

CREATE TABLE calc_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  air_kg_per_cbm REAL NOT NULL,
  sea_kg_per_cbm REAL NOT NULL,
  express_divisor REAL NOT NULL,
  cai_factor REAL NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);

INSERT INTO calc_settings (
  id, air_kg_per_cbm, sea_kg_per_cbm, express_divisor, cai_factor, updated_at, updated_by
) VALUES (
  1, 167, 1000, 5000, 35.315, '1970-01-01T00:00:00.000Z', NULL
);

CREATE TABLE quote_counters (
  day_key TEXT PRIMARY KEY NOT NULL,
  last_n INTEGER NOT NULL
);

CREATE TABLE quotes (
  id TEXT PRIMARY KEY NOT NULL,
  quote_number TEXT NOT NULL UNIQUE,
  customer_name TEXT NOT NULL DEFAULT '',
  quote_date TEXT NOT NULL,
  valid_until TEXT NOT NULL DEFAULT '',
  mode TEXT NOT NULL CHECK (mode IN ('air', 'lcl', 'fcl', 'express')),
  route TEXT NOT NULL DEFAULT '',
  document TEXT NOT NULL,
  selling_totals TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE INDEX idx_quotes_customer ON quotes (customer_name);
CREATE INDEX idx_quotes_date ON quotes (quote_date);
CREATE INDEX idx_quotes_mode ON quotes (mode);
CREATE INDEX idx_quotes_updated ON quotes (updated_at);

CREATE TABLE backup_imports (
  id TEXT PRIMARY KEY NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('merge')),
  quote_count INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL
);
