"""장면 클립 5개를 60초 세로 영상으로 합치고 자막을 입히고 내레이션을 얹는다.

실행: python tools/video/assemble.py   (out/ 아래 fail·prompt·main·full·end.mp4 와 .json, tts/*.wav 필요)
산출: out/final_captions.mp4(자막만), out/final_narration.mp4(자막+내레이션), out/burn.ass, out/preview/*.png
"""
import json, os, re, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "out"
TTS = OUT / "tts"
FF = ["ffmpeg", "-y", "-loglevel", "error"]


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0:
        print("명령 실패:", " ".join(str(c) for c in cmd), "\n", r.stderr, file=sys.stderr)
        sys.exit(1)
    return r.stdout


def dur(path):
    return float(run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)]).strip())


def meta(name):
    m = json.loads((OUT / f"{name}.json").read_text(encoding="utf-8"))
    marks = {x["name"]: x["t"] for x in m["marks"]}
    return m, marks


def cut(name, start, length, idx):
    src, dst = OUT / f"{name}.mp4", OUT / f"seg{idx}_{name}.mp4"
    run(FF + ["-ss", f"{max(0.0, start):.3f}", "-i", str(src), "-t", f"{length:.3f}", "-an",
              "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-r", "30", "-pix_fmt", "yuv420p", "-video_track_timescale", "15360", str(dst)])
    d = dur(dst)
    print(f"{dst.name}: 요청 {length:.2f}s, 실제 {d:.2f}s")
    return dst


def ass_time(t):
    h = int(t // 3600); m = int(t % 3600 // 60); s = t % 60
    return f"{h}:{m:02d}:{s:05.2f}"


def write_ass(cues, path):
    head = """[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,Malgun Gothic,52,&H00FFFFFF,&H00FFFFFF,&H00000000,&H28000000,-1,0,0,0,100,100,0,0,4,12,0,8,60,60,34,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    lines = [head]
    for s, e, text in cues:
        lines.append(f"Dialogue: 0,{ass_time(s)},{ass_time(e)},Cap,,0,0,0,,{text.replace(chr(10), chr(92) + 'N')}\n")
    path.write_text("".join(lines), encoding="utf-8")


def main():
    # 1. 장면 구간
    fail_d = dur(OUT / "fail.mp4")
    _, pm = meta("prompt"); _, mm = meta("main"); fm, fmk = meta("full"); _, em = meta("end")
    segs = [
        cut("fail", fail_d - 5.0, 5.0, 1),
        cut("prompt", pm["go"], 12.0, 2),
        cut("main", max(0.0, mm["open"] - 6.0), 19.0, 3),
        cut("full", fmk["captcha"], 16.0, 4),
        cut("end", em["go"], 8.0, 5),
    ]
    lst = OUT / "segs.txt"
    lst.write_text("".join(f"file '{p.as_posix()}'\n" for p in segs), encoding="utf-8")
    base = OUT / "base.mp4"
    run(FF + ["-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", str(base)])
    print("base.mp4:", f"{dur(base):.2f}s")

    # 2. 자막 시각: 완주 장면의 표식을 최종 시간축(36초 시작)으로 옮긴다
    off = 36.0 - fmk["captcha"]
    t_seats = fmk["seats"] + off
    t_pay = fmk["pay"] + off
    t_done = fmk["done"] + off
    res = (fm.get("result") or {})
    total_txt = ""
    m = re.search(r"오픈부터\s*([\d.]+)초", (res.get("summary") or {}).get("result", ""))
    if m:
        total_txt = m.group(1).split(".")[0] + "초"
    cues = [
        (0.0, 2.5, "또 매진."),
        (2.5, 5.0, "티켓팅, 저만\n매번 지는 거 아니죠?"),
        (5.0, 12.0, "그래서 AI한테\n연습장을 만들어 달라고 했어요"),
        (12.0, 17.0, "대기열·보안문자·좌석·결제까지\nHTML 파일 하나"),
        (17.0, 23.0, "실제 예매처처럼\n카운트다운"),
        (23.0, 28.0, "내 손가락\n반응속도까지 측정"),
        (28.0, 32.0, "18만 명 대기열도\n그대로"),
        (32.0, 36.0, "새로고침하면\n이렇게 됩니다"),
        (36.0, t_seats, "한/영 전환 실수도\n커버"),
        (t_seats, t_pay, "좌석은 눈 깜짝할 새\n사라져요"),
        (t_pay, t_done, "결제 승인까지\n그대로"),
        (t_done, min(52.0, t_done + 2.6), "오픈부터 결제까지\n" + (total_txt or "완료")),
        (min(52.0, t_done + 2.6), 52.0, "이제 실전에서도\n손이 안 떨려요"),
    ]
    ass = OUT / "burn.ass"
    write_ass(cues, ass)
    (OUT / "burn_cues.json").write_text(json.dumps(cues, ensure_ascii=False, indent=1), encoding="utf-8")

    # 3. 자막 입히기 (상대 경로로 넘겨 윈도우 경로 이스케이프를 피한다)
    burned = OUT / "burned.mp4"
    run(FF + ["-i", str(base), "-vf", "ass=burn.ass", "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-pix_fmt", "yuv420p", str(burned)]) if False else None
    r = subprocess.run(FF + ["-i", "base.mp4", "-vf", "ass=burn.ass", "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-pix_fmt", "yuv420p", "burned.mp4"],
                       cwd=str(OUT), capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0:
        print("자막 입히기 실패:", r.stderr, file=sys.stderr); sys.exit(1)

    # 4. 내레이션 합치기 (시작 시각: 콘티 기준, 7·8번은 실제 표식)
    starts = [0.0, 5.0, 12.0, 17.0, 23.0, 28.0, 36.0, t_pay, 52.0]
    wavs = [TTS / f"n{i:02d}.wav" for i in range(1, 10)]
    for w in wavs:
        if not w.exists():
            print("내레이션 파일 없음:", w, file=sys.stderr); sys.exit(1)
    inputs = []
    for w in wavs:
        inputs += ["-i", str(w)]
    fc = "".join(f"[{i + 1}:a]adelay={int(starts[i] * 1000)}|{int(starts[i] * 1000)},volume=1.6[a{i + 1}];" for i in range(9))
    fc += "".join(f"[a{i + 1}]" for i in range(9)) + "amix=inputs=9:normalize=0:dropout_transition=0,apad[na]"
    final_n = OUT / "final_narration.mp4"
    run(FF + ["-i", str(burned)] + inputs + ["-filter_complex", fc, "-map", "0:v", "-map", "[na]", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", str(final_n)])
    final_c = OUT / "final_captions.mp4"
    run(FF + ["-i", str(burned), "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100", "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "96k", "-shortest", "-movflags", "+faststart", str(final_c)])
    print("final_narration.mp4:", f"{dur(final_n):.2f}s", "/ final_captions.mp4:", f"{dur(final_c):.2f}s")

    # 5. 검토용 정지 화면
    pv = OUT / "preview"; pv.mkdir(exist_ok=True)
    for t in [1, 8, 15, 20, 24, 30, 34, 37, 41, 45, 49, 54, 59]:
        run(FF + ["-ss", str(t), "-i", str(final_n), "-frames:v", "1", "-vf", "scale=360:-1", str(pv / f"t{t:02d}.png")])
    run(FF + ["-i", str(final_n), "-vf", "fps=1/4,scale=270:-1,tile=5x3", "-frames:v", "1", str(pv / "sheet.png")])
    print("미리보기:", pv)
    print("자막 구간:", json.dumps({"seats": round(t_seats, 2), "pay": round(t_pay, 2), "done": round(t_done, 2), "total": total_txt}, ensure_ascii=False))


if __name__ == "__main__":
    main()
