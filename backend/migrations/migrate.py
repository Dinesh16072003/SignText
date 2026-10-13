from app.config import DATABASE_URL
from app.db import engine
from app.models import Base
from migrations.runner import get_versions, run_migrations


def main() -> None:
    print(f"Database: {DATABASE_URL}")
    Base.metadata.create_all(bind=engine)
    tables = ", ".join(sorted(Base.metadata.tables))
    print(f"Tables ready: {tables}")
    applied = run_migrations(engine)
    if applied:
        print(f"Applied migration(s): {applied}")
    else:
        print("No pending migrations.")


if __name__ == "__main__":
    main()