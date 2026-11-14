-- Foundation only: no song persistence before the editor contract is established.
CREATE TABLE app_metadata (key text PRIMARY KEY, value text NOT NULL);
INSERT INTO app_metadata(key,value) VALUES ('schema_version','1');
