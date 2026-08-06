CREATE TYPE session_visibility AS ENUM ('unlisted', 'public');
ALTER TABLE sessions ADD COLUMN visibility session_visibility NOT NULL DEFAULT 'unlisted';
CREATE INDEX session_participants_session_status_idx ON session_participants (session_id, status);
