# One-time migration: shift every parquet index from naive-UTC to tz-aware IST.
# A sibling marker file (.tz_fixed) prevents double-shifting if run again.
import os
import pandas as pd
from config import DATA_FOLDER

MARKER_EXT = ".tz_fixed"


def fix_parquet(fp):
    marker = fp + MARKER_EXT
    if os.path.exists(marker):
        return "skipped (already fixed)"

    df = pd.read_parquet(fp)

    # Safety check: if the index is already tz-aware, don't shift again
    if hasattr(df.index, "tzinfo") and df.index.tzinfo is not None:
        open(marker, "w").close()
        return "skipped (already tz-aware)"

    before = repr(df.index[0]) if len(df) else "(empty)"

    # Shift: treat existing naive index as UTC, convert to IST
    df.index = df.index.tz_localize("UTC").tz_convert("Asia/Kolkata")

    after = repr(df.index[0]) if len(df) else "(empty)"

    df.to_parquet(fp)
    open(marker, "w").close()
    return f"{before}  ->  {after}"


def main():
    total = fixed = skipped = errors = 0

    for root, dirs, files in os.walk(DATA_FOLDER):
        # Skip hidden / cache folders
        dirs[:] = [d for d in dirs if not d.startswith(".")]
        for fname in files:
            if not fname.endswith(".parquet"):
                continue
            fp = os.path.join(root, fname)
            total += 1
            try:
                result = fix_parquet(fp)
                rel = os.path.relpath(fp, DATA_FOLDER)
                if result.startswith("skipped"):
                    skipped += 1
                    print(f"  SKIP  {rel}")
                else:
                    fixed += 1
                    print(f"  OK    {rel}")
                    print(f"        {result}")
            except Exception as e:
                errors += 1
                print(f"  ERR   {os.path.relpath(fp, DATA_FOLDER)}: {e}")

    print(f"\nDone. {total} parquets found | {fixed} fixed | {skipped} skipped | {errors} errors")


if __name__ == "__main__":
    main()
