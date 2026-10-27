"""포스트시즌 예매 리허설: 아티팩트 본문에 독립 실행용 래퍼를 씌워 index.html 을 만든다.

표준 라이브러리만 사용한다. 실행: python tools/build.py
"""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "postseason-rehearsal.artifact.html"
OUT = ROOT / "index.html"
SIZE_LIMIT = 120 * 1024  # 120KB
FIRST_LINE = "<title>포스트시즌 예매 리허설</title>"

WRAP_HEAD = (
    '<!doctype html><html lang="ko"><head><meta charset="utf-8">'
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
    "<style>:root{color-scheme:light;box-sizing:border-box}"
    "body{margin:0;padding:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#fff;color:#000}"
    "img{max-width:100%}[hidden]:not([hidden=until-found i]){display:none!important}</style>"
    "</head><body>"
)
WRAP_TAIL = "</body></html>"


def fail(msg: str) -> None:
    print("빌드 실패: " + msg, file=sys.stderr)
    sys.exit(1)


def main() -> None:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")  # 윈도우 콘솔에서도 한글 메시지가 깨지지 않게
    raw = SRC.read_bytes()
    if raw.startswith(b"\xef\xbb\xbf"):
        fail("아티팩트 파일에 BOM 이 있습니다.")
    if b"\r" in raw:
        fail("아티팩트 파일에 CR(윈도우 줄바꿈)이 있습니다. LF 로 저장하세요.")
    text = raw.decode("utf-8")
    if not text.startswith(FIRST_LINE):
        fail("아티팩트 파일은 " + FIRST_LINE + " 로 시작해야 합니다.")
    if len(raw) > SIZE_LIMIT:
        fail("아티팩트 파일이 120KB 를 넘습니다: %d bytes" % len(raw))

    body = text if text.endswith("\n") else text + "\n"
    page = WRAP_HEAD + "\n" + body + WRAP_TAIL + "\n"
    data = page.encode("utf-8")
    OUT.write_bytes(data)  # 바이트로 써서 LF·BOM 없음을 그대로 유지

    print("artifact : %s  %d bytes (%.1f KB)" % (SRC.name, len(raw), len(raw) / 1024))
    print("index    : %s  %d bytes (%.1f KB)" % (OUT.name, len(data), len(data) / 1024))
    if len(data) > SIZE_LIMIT:
        print("경고: index.html 이 120KB 를 넘습니다.", file=sys.stderr)


if __name__ == "__main__":
    main()
