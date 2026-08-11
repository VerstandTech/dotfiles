import importlib.util
import unittest
from pathlib import Path


SCRIPT_PATH = Path(__file__).with_name("validate_features.py")


def load_validator():
    spec = importlib.util.spec_from_file_location("validate_features", SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load {SCRIPT_PATH}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


VALID_DOCUMENT = """# Features

## Summary

- **Tier 1 features:** `1`
- **Tier 2 features:** `1`

## Tier 1 - Fully Supported

| ID | Feature | Area | Notes And Boundaries |
| -- | ------- | ---- | -------------------- |
| `DOCS-UI-EDIT` | Edit a document | `ghee-docs` | Visible UI. Durable outcome: persists. |

## Tier 2 - Read-Only Or Seeded

| ID | Feature | Area | Notes And Boundaries |
| -- | ------- | ---- | -------------------- |
| `DRIVE-MCP-READ` | Read a file | `ghee-drive` | MCP: `get_file`. Read-only. |

## Stubs And Absent Features
"""


class ValidateFeaturesTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.validator = load_validator()

    def test_accepts_matching_counts_and_unique_ids(self):
        result = self.validator.validate_text(VALID_DOCUMENT)

        self.assertEqual([], result.errors)
        self.assertEqual(1, result.tier_1_count)
        self.assertEqual(1, result.tier_2_count)

    def test_rejects_stale_summary_count(self):
        document = VALID_DOCUMENT.replace(
            "- **Tier 1 features:** `1`", "- **Tier 1 features:** `2`"
        )

        result = self.validator.validate_text(document)

        self.assertIn("Tier 1 summary says 2, but the table contains 1 row", result.errors)

    def test_rejects_duplicate_ids_across_tiers(self):
        document = VALID_DOCUMENT.replace("DRIVE-MCP-READ", "DOCS-UI-EDIT")

        result = self.validator.validate_text(document)

        self.assertIn("Duplicate feature ID: DOCS-UI-EDIT", result.errors)


if __name__ == "__main__":
    unittest.main()
