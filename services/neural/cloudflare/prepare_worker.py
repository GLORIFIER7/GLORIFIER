"""Stage the repository's application package inside the Cloudflare Worker source tree."""

from pathlib import Path
import shutil


WORKER_ROOT = Path(__file__).resolve().parent
SOURCE_APP = WORKER_ROOT.parent / "app"
WORKER_APP = WORKER_ROOT / "neural_app" / "app"


def main() -> None:
    if not (SOURCE_APP / "api.py").is_file():
        raise SystemExit(f"Neural application source is missing: {SOURCE_APP}")

    if WORKER_APP.exists():
        shutil.rmtree(WORKER_APP)

    shutil.copytree(
        SOURCE_APP,
        WORKER_APP,
        ignore=shutil.ignore_patterns("__pycache__", "*.pyc"),
    )

    required = (
        WORKER_APP / "api.py",
        WORKER_APP / "database" / "neon.py",
        WORKER_APP / "neural" / "torch_status.py",
    )
    missing = [str(path.relative_to(WORKER_ROOT)) for path in required if not path.is_file()]
    if missing:
        raise SystemExit(f"Worker source staging is incomplete: {', '.join(missing)}")


if __name__ == "__main__":
    main()
