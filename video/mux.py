"""Builds the narration track and subtitles, then encodes the final MP4.
Sync: the recorder flips a 12 px colour marker in the top-left corner each time a subtitle appears; the marker is read back
from the recorded frames, so every spoken sentence is placed exactly where its subtitle shows, whatever the recorder's timing."""
import json, subprocess, wave, numpy as np, sys
from narration import SCENES
M = json.load(open("marks.json")); T = json.load(open("tts/timing.json")); vid = M["video"]
FPS = 25.0
raw = subprocess.check_output(["ffmpeg", "-v", "error", "-i", vid, "-vf", "fps=25,crop=8:8:2:2,scale=1:1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"])
px = np.frombuffer(raw, dtype=np.uint8).reshape(-1, 3).astype(int)
def cls(p):
    r, g, b = p; m = max(p)
    if m < 150 or (m - sorted(p)[1]) < 70: return -1
    return int(np.argmax(p))
ids = [cls(p) for p in px]
runs = []
for i, c in enumerate(ids):
    if runs and runs[-1][0] == c: runs[-1][2] = i
    else: runs.append([c, i, i])
runs = [r for r in runs if r[2] - r[1] >= 2]
merged = []
for r in runs:
    if merged and merged[-1][0] == r[0]: merged[-1][2] = r[2]
    else: merged.append(r)
starts = [r[1] / FPS for r in merged if r[0] >= 0]
sents = [(k, s) for k, _ in SCENES for s in T[k]["sentences"]]
print("frames", len(ids), "video s", round(len(ids) / FPS, 2), "marker switches", len(starts), "sentences", len(sents))
assert len(starts) == len(sents), "marker count mismatch"
trim = max(0.0, starts[0] - 0.35)
end = starts[-1] + sents[-1][1]["dur"] + 1.3
total = min(end, len(ids) / FPS) - trim
SR = 16000
track = np.zeros(int((total + 1) * SR), dtype=np.float32); srt = []
def ts(t): return ("%02d:%02d:%06.3f" % (int(t // 3600), int(t % 3600 // 60), t % 60)).replace(".", ",")
prev_end = 0.0
for n, (t0, (k, s)) in enumerate(zip(starts, sents), 1):
    t = max(t0 - trim, prev_end + 0.14)   # never let two spoken sentences overlap
    prev_end = t + s["dur"]
    w = wave.open(s["file"]); d = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768; w.close()
    i = int(t * SR); d = d[:max(0, len(track) - i)]; track[i:i + len(d)] += d
    srt.append("%d\n%s --> %s\n%s\n" % (n, ts(t), ts(t + s["dur"]), s["text"]))
over = float(np.abs(track).max()); track = np.clip(track * (0.95 / max(over, 0.95)), -1, 1)
w = wave.open("narration.wav", "w"); w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((track * 32767).astype(np.int16).tobytes()); w.close()
open("VayuVyuha_walkthrough.srt", "w").write("\n".join(srt))
out = sys.argv[1] if len(sys.argv) > 1 else "VayuVyuha_walkthrough.mp4"
fc = ("[0:v]fps=25,trim=start=%.3f:duration=%.3f,setpts=PTS-STARTPTS,drawbox=x=0:y=0:w=14:h=14:color=0xf4f7fb:t=fill,scale=1920:1080:flags=lanczos,format=yuv420p[v];"
      "[1:a]highpass=f=70,loudnorm=I=-17:TP=-1.5:LRA=11,aresample=44100[a]") % (trim, total)
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", vid, "-i", "narration.wav", "-filter_complex", fc, "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "medium", "-crf", "20",
                "-c:a", "aac", "-b:a", "160k", "-ac", "2", "-movflags", "+faststart", "-t", "%.3f" % total, out], check=True)
json.dump({"trim": trim, "total": total, "starts": [round(x - trim, 3) for x in starts]}, open("sync.json", "w"))
print(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration,size:stream=codec_name,width,height", "-of", "default=nw=1", out]).decode())
