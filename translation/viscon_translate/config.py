"""Settings from environment variables, loaded from `translation/.env` if present."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

TR_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(TR_ROOT / ".env")


class ConfigError(Exception):
    pass


def _path(name: str, default: Path) -> Path:
    value = os.getenv(name)
    if not value:
        return default
    p = Path(value)
    return p if p.is_absolute() else (TR_ROOT / p).resolve()


@dataclass(frozen=True)
class Settings:
    pdf_dir: Path
    index_path: Path
    cache_path: Path
    book_index_path: Path
    model: str | None
    target_lang: str
    api_key: str | None
    host: str
    port: int

    def require_key(self) -> str:
        if not self.api_key:
            raise ConfigError("OPENAI_API_KEY is not set. Copy .env.example to .env and add your key.")
        return self.api_key

    def require_model(self) -> str:
        if not self.model:
            raise ConfigError(
                "No model configured. Set TR_MODEL in .env; "
                "`python -m viscon_translate models` lists the models your key can use."
            )
        return self.model


def load_settings() -> Settings:
    return Settings(
        pdf_dir=_path("TR_PDF_DIR", TR_ROOT),
        index_path=_path("TR_INDEX_PATH", TR_ROOT / "data" / "index.json"),
        cache_path=_path("TR_CACHE_PATH", TR_ROOT / "data" / "cache.json"),
        book_index_path=_path("TR_BOOK_INDEX_PATH", TR_ROOT / "data" / "book_index.json"),
        model=os.getenv("TR_MODEL") or None,
        target_lang=os.getenv("TR_TARGET_LANG") or "English",
        api_key=os.getenv("OPENAI_API_KEY") or None,
        host=os.getenv("TR_HOST") or "127.0.0.1",
        port=int(os.getenv("TR_PORT") or 8788),
    )
