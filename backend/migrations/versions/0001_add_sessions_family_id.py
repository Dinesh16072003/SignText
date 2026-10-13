import sqlalchemy as sa

VERSION = 1
DESCRIPTION = "Add family_id to sessions so refresh-token rotation can revoke a family on reuse (B3)."

_NEW_SESSIONS_DDL = """
CREATE TABLE sessions_new (
    id CHAR(32) NOT NULL,
    user_id CHAR(32) NOT NULL,
    family_id CHAR(32) NOT NULL,
    token_hash VARCHAR(255) NOT NULL,
    expires_at DATETIME NOT NULL,
    revoked_at DATETIME,
    user_agent VARCHAR(255),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
)
"""


def upgrade(connection) -> None:
    columns = {
        row[1] for row in connection.execute(sa.text("PRAGMA table_info(sessions)"))
    }

    if "family_id" in columns:
        connection.execute(
            sa.text("CREATE INDEX IF NOT EXISTS ix_sessions_family_id ON sessions (family_id)")
        )
        return

    connection.execute(sa.text(_NEW_SESSIONS_DDL))
    connection.execute(
        sa.text(
            "INSERT INTO sessions_new (id, user_id, family_id, token_hash, expires_at, "
            "revoked_at, user_agent, created_at) "
            "SELECT id, user_id, id, token_hash, expires_at, revoked_at, user_agent, "
            "created_at FROM sessions"
        )
    )
    connection.execute(sa.text("DROP TABLE sessions"))
    connection.execute(sa.text("ALTER TABLE sessions_new RENAME TO sessions"))
    connection.execute(sa.text("CREATE INDEX ix_sessions_user_id ON sessions (user_id)"))
    connection.execute(sa.text("CREATE INDEX ix_sessions_token_hash ON sessions (token_hash)"))
    connection.execute(sa.text("CREATE INDEX ix_sessions_family_id ON sessions (family_id)"))