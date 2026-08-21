"""Allow database seeds to run with ``python -m app.seeds``."""

from app.seeds.cli import main

if __name__ == "__main__":
    main()
