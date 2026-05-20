"""Helper to build a Reform class from a JSON override file.

Supports path segments with array index notation like ``brackets[N]`` which
PolicyEngine's built-in ``Reform.from_dict`` does not handle.
"""

from __future__ import annotations

import re
from typing import Any, Dict


def build_reform_class_from_overrides(overrides: Dict[str, Dict[str, Any]]):
    """Return a Reform subclass that applies the given parameter overrides.

    Paths like ``foo.bar[2].baz`` are walked by indexing into list-valued
    attributes after a matching ``name[N]`` segment.
    """
    from policyengine_core.reforms import Reform
    from policyengine_core.periods import instant

    def modify(parameters):
        for path, periods in overrides.items():
            node = parameters
            for segment in path.split("."):
                match = re.match(r"(\w+)\[(\d+)\]", segment)
                if match:
                    node = getattr(node, match.group(1))[int(match.group(2))]
                else:
                    node = getattr(node, segment)
            for period_str, value in periods.items():
                if "." in period_str and len(period_str) > 10:
                    start_str, stop_str = period_str.split(".")
                else:
                    start_str = (
                        period_str if "-" in period_str else f"{period_str}-01-01"
                    )
                    stop_str = "2100-12-31"
                node.update(
                    start=instant(start_str),
                    stop=instant(stop_str),
                    value=value,
                )
        return parameters

    class _JsonReform(Reform):
        def apply(self):
            self.modify_parameters(modify)

    return _JsonReform
