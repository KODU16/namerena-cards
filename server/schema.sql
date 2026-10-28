-- cards_run：一局一行，不记录每场战斗明细
CREATE TABLE IF NOT EXISTS cards_run (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    user_key         TEXT    NOT NULL,
    lane             TEXT    NOT NULL DEFAULT '1A',
    clan             TEXT    NOT NULL DEFAULT '',
    team_size        INTEGER NOT NULL DEFAULT 1,
    seed             INTEGER NOT NULL DEFAULT 0,
    ladder_source    TEXT    NOT NULL DEFAULT '',
    team_json        TEXT    NOT NULL DEFAULT '[]',
    status           TEXT    NOT NULL DEFAULT 'active',
    wins             INTEGER NOT NULL DEFAULT 0,
    layers           INTEGER NOT NULL DEFAULT 0,
    started_at       TEXT    NOT NULL,
    finished_at      TEXT,
    duration_seconds INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_cards_run_user ON cards_run (user_key, status);
