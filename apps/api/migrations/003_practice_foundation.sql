CREATE TABLE practice_owners (id text PRIMARY KEY);
INSERT INTO practice_owners(id) VALUES ('local') ON CONFLICT DO NOTHING;
CREATE TABLE practice_exercise_ids (id text PRIMARY KEY);
CREATE TABLE practice_exercises (
 id text NOT NULL REFERENCES practice_exercise_ids(id), version integer NOT NULL CHECK(version>0),
 lab text NOT NULL CHECK(lab IN ('rhythm','scale','chord','technique')),
 level text NOT NULL CHECK(level IN ('Basis','Ontwikkeling','Toepassing','Verdieping')),
 category text NOT NULL, title text NOT NULL, document jsonb NOT NULL,
 PRIMARY KEY(id,version), CHECK(document->>'id'=id), CHECK((document->>'version')::int=version)
);
CREATE INDEX practice_catalog_filters ON practice_exercises(lab,level,category);
CREATE TABLE practice_configurations (
 owner_id text NOT NULL REFERENCES practice_owners(id) ON DELETE CASCADE,
 configuration_key text NOT NULL CHECK(configuration_key ~ '^[a-f0-9]{64}$'),
 exercise_id text NOT NULL, exercise_version integer NOT NULL, document jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(owner_id,configuration_key),
 UNIQUE(owner_id,exercise_id,exercise_version,configuration_key),
 FOREIGN KEY(exercise_id,exercise_version) REFERENCES practice_exercises(id,version)
);
CREATE TABLE practice_exercise_settings (
 owner_id text NOT NULL REFERENCES practice_owners(id) ON DELETE CASCADE, exercise_id text NOT NULL, exercise_version integer NOT NULL,
 configuration_key text NOT NULL, revision integer NOT NULL CHECK(revision>0),
 PRIMARY KEY(owner_id,exercise_id),
 FOREIGN KEY(owner_id,exercise_id,exercise_version,configuration_key) REFERENCES practice_configurations(owner_id,exercise_id,exercise_version,configuration_key)
);
CREATE TABLE practice_sessions (
 owner_id text NOT NULL REFERENCES practice_owners(id) ON DELETE CASCADE, id uuid NOT NULL,
 exercise_id text NOT NULL, exercise_version integer NOT NULL, configuration_key text NOT NULL,
 started_at timestamptz NOT NULL, ended_at timestamptz NOT NULL,
 duration_seconds integer NOT NULL CHECK(duration_seconds>=0), bpm integer NOT NULL CHECK(bpm BETWEEN 20 AND 300),
 rating integer NOT NULL CHECK(rating BETWEEN 1 AND 5), repetitions integer NOT NULL CHECK(repetitions>=0),
 result text NOT NULL CHECK(result IN ('Uitgevoerd','Beheerst')), document jsonb NOT NULL,
 PRIMARY KEY(owner_id,id), CHECK(ended_at>=started_at),
 CHECK(duration_seconds<=extract(epoch FROM ended_at-started_at)+1),
 FOREIGN KEY(owner_id,exercise_id,exercise_version,configuration_key) REFERENCES practice_configurations(owner_id,exercise_id,exercise_version,configuration_key)
);
CREATE INDEX practice_sessions_recent ON practice_sessions(owner_id,ended_at DESC,id);
CREATE INDEX practice_sessions_exercise ON practice_sessions(owner_id,exercise_id,ended_at DESC);
CREATE TABLE practice_mastery (
 owner_id text NOT NULL REFERENCES practice_owners(id) ON DELETE CASCADE,
 exercise_id text NOT NULL, exercise_version integer NOT NULL, scope text NOT NULL CHECK(scope IN ('configuration','exercise')),
 scope_key text NOT NULL, configuration_key text, mastered boolean NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(owner_id,exercise_id,exercise_version,scope_key),
 CHECK((scope='exercise' AND scope_key='*' AND configuration_key IS NULL) OR (scope='configuration' AND scope_key=configuration_key AND configuration_key IS NOT NULL)),
 FOREIGN KEY(exercise_id,exercise_version) REFERENCES practice_exercises(id,version),
 FOREIGN KEY(owner_id,exercise_id,exercise_version,configuration_key) REFERENCES practice_configurations(owner_id,exercise_id,exercise_version,configuration_key)
);
CREATE TABLE practice_progress (
 owner_id text NOT NULL REFERENCES practice_owners(id) ON DELETE CASCADE,
 exercise_id text NOT NULL REFERENCES practice_exercise_ids(id),
 last_practiced timestamptz, session_count integer NOT NULL DEFAULT 0 CHECK(session_count>=0),
 highest_bpm integer, status text NOT NULL CHECK(status IN ('Nog niet begonnen','Aan het oefenen','Uitgevoerd','Beheerst')),
 last_rating integer, mastered boolean NOT NULL DEFAULT false, mastered_configurations integer NOT NULL DEFAULT 0,
 PRIMARY KEY(owner_id,exercise_id)
);
CREATE TABLE song_practice_origins (
 owner_id text NOT NULL REFERENCES practice_owners(id) ON DELETE CASCADE, id uuid NOT NULL,
 source_song_id text REFERENCES studio_songs(id) ON DELETE SET NULL,
 document jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(owner_id,id)
);
CREATE INDEX song_practice_origins_source ON song_practice_origins(owner_id,source_song_id);
