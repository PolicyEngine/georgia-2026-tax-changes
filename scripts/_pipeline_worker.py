"""Subprocess worker for pipeline.py — runs one year in an isolated process.

Usage: python scripts/_pipeline_worker.py <year>

Outputs JSON to stdout with the reform result.
All progress messages go to stderr to keep stdout clean for JSON.
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _convert_for_json(obj):
    """Convert numpy types to Python types for JSON serialization."""
    import numpy as np

    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating,)):
        return float(obj)
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    if isinstance(obj, dict):
        return {k: _convert_for_json(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_convert_for_json(v) for v in obj]
    return obj


def main():
    year = int(sys.argv[1])
    from ga_tax_calc.microsimulation import calculate_aggregate_impact

    print(f"  Computing Georgia 2026 tax changes (HB463) for {year}...", file=sys.stderr)
    result = calculate_aggregate_impact(year=year)
    print(f"  Done: Georgia 2026 tax changes (HB463) {year}", file=sys.stderr)

    # Output JSON to stdout
    json.dump(_convert_for_json(result), sys.stdout)


if __name__ == "__main__":
    main()
