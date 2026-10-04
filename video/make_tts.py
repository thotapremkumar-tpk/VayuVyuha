import subprocess, json, wave, os
from narration import SCENES, SAY, GAP
os.makedirs("tts/clips", exist_ok=True)
timing = {}
for key, sents in SCENES:
    t = 0.0; rows = []
    for i, s in enumerate(sents):
        spoken = s
        for a, b in SAY.items(): spoken = spoken.replace(a, b)
        out = f"tts/clips/{key}_{i}.wav"
        subprocess.run(["piper", "-m", "tts/voice.onnx", "-f", out], input=spoken.encode(), check=True, capture_output=True)
        w = wave.open(out); d = w.getnframes() / w.getframerate(); w.close()
        rows.append({"text": s, "file": out, "start": round(t, 3), "dur": round(d, 3)})
        t += d + GAP
    timing[key] = {"sentences": rows, "dur": round(t - GAP, 3)}
    print(key, timing[key]["dur"])
json.dump(timing, open("tts/timing.json", "w"), indent=1)
print("total narration", round(sum(v["dur"] for v in timing.values()), 1), "s")
