CREATE TABLE studio_songs (
  id text PRIMARY KEY,
  document jsonb NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (document->>'id' = id)
);
CREATE TABLE studio_song_versions (
  song_id text NOT NULL REFERENCES studio_songs(id) ON DELETE CASCADE,
  revision integer NOT NULL,
  document jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (song_id, revision)
);
CREATE INDEX studio_songs_updated_at ON studio_songs(updated_at DESC);
