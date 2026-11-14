CREATE TABLE practice_preferences (
 owner_id text PRIMARY KEY REFERENCES practice_owners(id) ON DELETE CASCADE,
 goals jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(goals)='array' AND jsonb_array_length(goals)<=5),
 last_exercise_id text REFERENCES practice_exercise_ids(id),
 revision integer NOT NULL CHECK(revision>0)
);
