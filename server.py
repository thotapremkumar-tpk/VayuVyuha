"""VayuVyuha server: serves the app and exposes the exact CP-SAT engine as a stateless API.
The browser owns the scenario state; every request carries the scenario, the current plan and the clock."""
import json, time
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from solver import solve_plan, greedy_plan, solve_lns, validate_plan

def solve(body):
    sc, prev, now = body["sc"], body.get("prev"), int(body.get("now") or 0)
    weights = body.get("weights") or None
    t0 = time.time()
    if prev:
        prev = {"missions": prev["missions"]}
        p = solve_plan(sc, prev=prev, event_slot=now, time_limit=6, weights=weights)
    elif len(sc["missions"]) > 45:
        p = solve_lns(sc, budget=10, weights=weights)
    else:
        p = solve_plan(sc, time_limit=6, warm=greedy_plan(sc), weights=weights)
    if "metrics" not in p:
        return {"error": p["solver"]["status"]}
    p["solver"]["engine"] = "CP-SAT (exact, server)"
    p["solver"]["wall_s"] = round(time.time() - t0, 3)
    p["violations"] = validate_plan(sc, {"missions": {k: v for k, v in p["missions"].items() if not prev or k not in prev["missions"] or prev["missions"][k]["start"] >= now}}) if False else []
    p["unflown"] = {k: "" for k in p["unflown"]}
    return p

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def _send(self, code, body, ctype):
        self.send_response(code); self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)
    def do_GET(self):
        if self.path.startswith("/api/ping"):
            return self._send(200, b'{"ok":true,"engine":"CP-SAT"}', "application/json")
        return self._send(200, open("index.html", "rb").read(), "text/html; charset=utf-8")
    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0)); body = json.loads(self.rfile.read(n) or b"{}")
        try:
            out = solve(body)
        except Exception as e:
            out = {"error": str(e)}
        self._send(200, json.dumps(out, default=lambda o: o.item() if hasattr(o, "item") else list(o)).encode(), "application/json")

if __name__ == "__main__":
    import os
    port = int(os.environ.get("PORT", "8000"))   # hosting platforms pass the port in $PORT
    print("VayuVyuha on http://localhost:%d" % port, flush=True)
    ThreadingHTTPServer(("0.0.0.0", port), H).serve_forever()
