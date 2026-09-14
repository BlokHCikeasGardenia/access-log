-- Add blok and no_rumah columns to cards table for API card-list data
ALTER TABLE IF EXISTS cards
  ADD COLUMN IF NOT EXISTS blok TEXT,
  ADD COLUMN IF NOT EXISTS no_rumah TEXT;
