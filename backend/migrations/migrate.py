from app.config import DATABASE_URL
from app.db import engine
from app.models import Base


def main() -> None:
    print(f"Database: {DATABASE_URL}")
    Base.metadata.create_all(bind=engine)
    tables = ", ".join(sorted(Base.metadata.tables))
    print(f"Tables ready: {tables}")


if __name__ == "__main__":
    main()
