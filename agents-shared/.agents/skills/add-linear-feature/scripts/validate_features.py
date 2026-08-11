#!/usr/bin/env python3
"""Validate feature-table counts and IDs in dataset/FEATURES.md."""

from __future__ import annotations

import argparse
import re
import sys
from collections import Counter
from pathlib import Path
from typing import NamedTuple


class ValidationResult(NamedTuple):
    errors: list[str]
    tier_1_count: int
    tier_2_count: int


def _section(text: str, heading: str, errors: list[str]) -> str:
    match = re.search(rf"^## {re.escape(heading)}\s*$", text, re.MULTILINE)
    if match is None:
        errors.append(f"Missing section: {heading}")
        return ""

    next_heading = re.search(r"^## ", text[match.end() :], re.MULTILINE)
    end = match.end() + next_heading.start() if next_heading else len(text)
    return text[match.end() : end]


def _feature_ids(section: str) -> list[str]:
    return re.findall(r"^\|\s*`([A-Z0-9]+(?:-[A-Z0-9]+)*)`\s*\|", section, re.MULTILINE)


def _summary_count(text: str, tier: int, errors: list[str]) -> int | None:
    match = re.search(
        rf"^- \*\*Tier {tier} features:\*\* `([0-9]+)`\s*$", text, re.MULTILINE
    )
    if match is None:
        errors.append(f"Missing Tier {tier} summary count")
        return None
    return int(match.group(1))


def _row_word(count: int) -> str:
    return "row" if count == 1 else "rows"


def validate_text(text: str) -> ValidationResult:
    errors: list[str] = []
    tier_1_ids = _feature_ids(_section(text, "Tier 1 - Fully Supported", errors))
    tier_2_ids = _feature_ids(_section(text, "Tier 2 - Read-Only Or Seeded", errors))
    summary_1 = _summary_count(text, 1, errors)
    summary_2 = _summary_count(text, 2, errors)

    if summary_1 is not None and summary_1 != len(tier_1_ids):
        errors.append(
            f"Tier 1 summary says {summary_1}, but the table contains "
            f"{len(tier_1_ids)} {_row_word(len(tier_1_ids))}"
        )
    if summary_2 is not None and summary_2 != len(tier_2_ids):
        errors.append(
            f"Tier 2 summary says {summary_2}, but the table contains "
            f"{len(tier_2_ids)} {_row_word(len(tier_2_ids))}"
        )

    duplicates = sorted(
        feature_id
        for feature_id, count in Counter(tier_1_ids + tier_2_ids).items()
        if count > 1
    )
    errors.extend(f"Duplicate feature ID: {feature_id}" for feature_id in duplicates)

    return ValidationResult(errors, len(tier_1_ids), len(tier_2_ids))


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Validate feature counts and duplicate IDs in FEATURES.md."
    )
    parser.add_argument(
        "path",
        nargs="?",
        default="dataset/FEATURES.md",
        help="Path to FEATURES.md (default: dataset/FEATURES.md)",
    )
    args = parser.parse_args()
    path = Path(args.path)

    try:
        text = path.read_text(encoding="utf-8")
    except OSError as error:
        print(f"ERROR: cannot read {path}: {error}", file=sys.stderr)
        return 2

    result = validate_text(text)
    if result.errors:
        for error in result.errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1

    print(
        f"OK: Tier 1={result.tier_1_count}, Tier 2={result.tier_2_count}, "
        f"unique IDs={result.tier_1_count + result.tier_2_count}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
