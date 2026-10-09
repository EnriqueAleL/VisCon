"""Thin LLM layer: one call shape (instructions + input -> validated Pydantic object).

Everything else talks to the `LLM` protocol, so tests can use a fake and
another provider can be added without touching the pipeline.
"""
from __future__ import annotations

from typing import Protocol, TypeVar

from pydantic import BaseModel

T = TypeVar("T", bound=BaseModel)


class LLM(Protocol):
    def parse(self, *, model: str, instructions: str, input: str, schema: type[T]) -> T: ...


class OpenAILLM:
    def __init__(self, api_key: str) -> None:
        from openai import OpenAI

        self._client = OpenAI(api_key=api_key)

    def parse(self, *, model: str, instructions: str, input: str, schema: type[T]) -> T:
        response = self._client.responses.parse(
            model=model, instructions=instructions, input=input, text_format=schema
        )
        parsed = response.output_parsed
        if parsed is None:
            raise RuntimeError(f"Model returned no structured output (status: {response.status}).")
        return parsed

    def list_models(self) -> list[str]:
        return sorted(m.id for m in self._client.models.list())
