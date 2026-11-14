ALTER TABLE studio_songs ADD CONSTRAINT studio_songs_owner_id_unique UNIQUE(owner_id,id);
CREATE TABLE studio_song_schema_backups (
  owner_id text NOT NULL,
  song_id text NOT NULL,
  source_revision integer NOT NULL CHECK(source_revision>0),
  source_schema integer NOT NULL CHECK(source_schema IN (1,2)),
  document jsonb NOT NULL,
  checksum text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(owner_id,song_id,source_revision),
  FOREIGN KEY(owner_id,song_id) REFERENCES studio_songs(owner_id,id) ON DELETE CASCADE,
  CHECK(document->>'id'=song_id),
  CHECK((document->>'schemaVersion')::int=source_schema),
  CHECK(checksum=md5(document::text))
);
