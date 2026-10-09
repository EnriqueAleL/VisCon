"""Settings from environment variables, loaded from `qa/.env` if present."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

QA_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(QA_ROOT / ".env")


class ConfigError(Exception):
    pass


def _path(name: str, default: Path) -> Path:
    value = os.getenv(name)
    if not value:
        return default
    p = Path(value)
    return p if p.is_absolute() else (QA_ROOT / p).resolve()


@dataclass(frozen=True)
class Settings:
    lectures_dir: Path
    index_path: Path
    index_model: str | None
    answer_model: str | None
    api_key: str | None

    def require_key(self) -> str:
        if not self.api_key:
            raise ConfigError("OPENAI_API_KEY is not set. Copy .env.example to .env and add your key.")
        return self.api_key

    def require_model(self, kind: str) -> str:
        model = self.index_model if kind == "index" else self.answer_model
        if not model:
            raise ConfigError(
                "No model configured. Set QA_INDEX_MODEL (and optionally QA_ANSWER_MODEL) in .env; "
                "`python -m viscon_qa models` lists the models your key can use."
            )
        return model


def load_settings() -> Settings:
    index_model = os.getenv("QA_INDEX_MODEL") or None
    return Settings(
        lectures_dir=_path("QA_LECTURES_DIR", QA_ROOT.parent / "lectures"),
        index_path=_path("QA_INDEX_PATH", QA_ROOT / "data" / "index.json"),
        index_model=index_model,
        answer_model=os.getenv("QA_ANSWER_MODEL") or index_model,
        api_key=os.getenv("OPENAI_API_KEY") or None,
    )
