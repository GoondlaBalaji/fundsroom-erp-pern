-- Migration: Add atomic sequence counter table for concurrency-safe business number generation
-- This table replaces the unsafe count() + 1 pattern used in all four document types.
-- A single row per (doc_type, date) is atomically incremented via UPDATE ... RETURNING.

CREATE TABLE document_sequences (
  doc_type  VARCHAR(10)  NOT NULL,
  date_key  CHAR(8)      NOT NULL,  -- YYYYMMDD
  last_seq  INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (doc_type, date_key)
);

-- Index is not needed beyond PK since lookups are always by (doc_type, date_key).
