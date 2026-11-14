ALTER TABLE studio_songs ADD COLUMN owner_id text NOT NULL DEFAULT 'local';
CREATE INDEX studio_songs_owner ON studio_songs(owner_id, updated_at DESC);
CREATE TABLE studio_imports (
  owner_id text NOT NULL,
  request_id uuid NOT NULL,
  input_hash text NOT NULL,
  song_id text NOT NULL REFERENCES studio_songs(id) ON DELETE CASCADE,
  arrangement_id text NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  provenance jsonb NOT NULL,
  PRIMARY KEY(owner_id, request_id)
);
CREATE INDEX studio_imports_song ON studio_imports(owner_id,song_id);
