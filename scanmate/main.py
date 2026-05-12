from __future__ import annotations

import uvicorn


def main() -> None:
    uvicorn.run("scanmate.app:app", host="0.0.0.0", port=8765, reload=False)


if __name__ == "__main__":
    main()
