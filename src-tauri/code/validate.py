#!/usr/bin/env python3
"""Validates CODE problems and drills against a real JDK.

  python3 validate.py                 # every problem and drill
  python3 validate.py two-sum lru-cache
  python3 validate.py --drills        # drills only
  python3 validate.py --no-bench      # skip timing (CI): correctness, examples and starter checks only

For each problem:
  1. problem.json has every field, with known pattern / difficulty / complexity
  2. the reference, renamed into the user's class, passes every fixed case, stress and bench
  3. the reference's output on the first cases matches the examples in the statement
  4. the reference's measured growth matches target.time (so the bench generator really stresses it)
  5. the starter compiles and fails at least one case (so the tests have teeth)
For each drill: it compiles, runs, and its stored output equals what Java prints.
"""
import json, math, os, re, shutil, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
JDK = next((p for p in [os.environ.get("JAVA_BIN", ""), "/opt/homebrew/opt/openjdk@21/bin", "/opt/homebrew/opt/openjdk@17/bin", "/opt/homebrew/opt/openjdk/bin"]
            if p and os.path.exists(os.path.join(p, "javac"))), None)
PATTERNS = {"hashing", "two-pointers", "sliding-window", "stack", "binary-search", "linked-list", "trees",
            "heap", "graphs", "backtracking", "dp", "dp2", "intervals", "design"}
DIFFS = {"easy", "medium", "hard"}
EXPONENT = {"1": 0.0, "log n": 0.1, "n": 1.0, "n log n": 1.08, "n^2": 2.0, "n^3": 3.0}
REQUIRED = ["id", "title", "pattern", "difficulty", "statement", "examples", "constraints", "params", "starter",
            "target", "hints", "followups", "explain"]


def slope(points):
    """Least-squares slope of log(time) on log(n), over up to six largest points that took ≥0.5 ms."""
    pts = [(n, ns) for n, ns in points if ns >= 500_000][-6:]
    if len(pts) < 2:
        return None
    xs = [math.log(n) for n, _ in pts]
    ys = [math.log(ns) for _, ns in pts]
    mx, my = sum(xs) / len(xs), sum(ys) / len(ys)
    den = sum((x - mx) ** 2 for x in xs)
    return sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / den if den else None


def as_solution(ref_text, classes):
    out = ref_text
    for c in classes:
        out = re.sub(r"\bRef\b" if c == "Solution" else rf"\bRef{c}\b", c, out)
    return out


def run(workdir, solution_text, mode, bench, timeout=60):
    with open(os.path.join(workdir, "Solution.java"), "w") as f:
        f.write(solution_text)
    out = os.path.join(workdir, "out")
    shutil.rmtree(out, ignore_errors=True)
    srcs = [os.path.join(workdir, x) for x in os.listdir(workdir) if x.endswith(".java")]
    c = subprocess.run([os.path.join(JDK, "javac"), "--release", "17", "-encoding", "UTF-8", "-nowarn", "-d", out, *srcs],
                       capture_output=True, text=True, timeout=120)
    if c.returncode != 0:
        return None, c.stderr
    bmin, bmax = (bench["min"], bench["max"]) if bench else (0, 0)
    r = subprocess.run([os.path.join(JDK, "java"), "-Xmx768m", "-XX:+UseSerialGC", "-cp", out, "Runner", mode, str(bmin), str(bmax), "4000"],
                       capture_output=True, text=True, timeout=timeout)
    events = []
    for line in r.stdout.splitlines():
        try:
            events.append(json.loads(line))
        except json.JSONDecodeError:
            events.append({"t": "garbage", "line": line})
    return events, r.stderr


def norm(s):
    return re.sub(r"\s+", "", s)


NO_BENCH = False  # --no-bench: correctness only, for noisy shared CI runners


def validate_problem(pid):
    errs, notes = [], []
    d = os.path.join(HERE, "problems", pid)
    try:
        p = json.load(open(os.path.join(d, "problem.json")))
    except Exception as e:
        return [f"problem.json: {e}"], notes
    for k in REQUIRED:
        if k not in p:
            errs.append(f"missing field '{k}'")
    if errs:
        return errs, notes
    if p["id"] != pid: errs.append(f"id '{p['id']}' != folder '{pid}'")
    if p["pattern"] not in PATTERNS: errs.append(f"unknown pattern '{p['pattern']}'")
    if p["difficulty"] not in DIFFS: errs.append(f"unknown difficulty '{p['difficulty']}'")
    # Benchmarked problems need a measurable target; unbenchmarked ones may state any honest bound (e.g. n·2^n).
    if p.get("bench") and p["target"].get("time") not in EXPONENT: errs.append(f"benchmarked problems need target.time in {list(EXPONENT)}")
    if not p["target"].get("time"): errs.append("target.time is empty")
    if len(p["hints"]) != 3: errs.append("need exactly 3 hints (nudge, insight, near-solution)")
    if len(p["followups"]) < 2: errs.append("need at least 2 followups")
    for f in ["Ref.java", "Cases.java"]:
        if not os.path.exists(os.path.join(d, f)): errs.append(f"missing {f}")
    if errs:
        return errs, notes

    classes = p.get("classes", ["Solution"])
    bench = None if NO_BENCH else p.get("bench")
    with tempfile.TemporaryDirectory() as w:
        for f in os.listdir(os.path.join(HERE, "harness")):
            shutil.copy(os.path.join(HERE, "harness", f), w)
        shutil.copy(os.path.join(d, "Ref.java"), w)
        shutil.copy(os.path.join(d, "Cases.java"), w)
        ref = open(os.path.join(d, "Ref.java")).read()

        ev, err = run(w, as_solution(ref, classes), "full", bench, timeout=120)
        if ev is None:
            return [f"reference does not compile:\n{err[:2000]}"], notes
        cases = [e for e in ev if e["t"] == "case"]
        bad = [e for e in ev if e["t"] in ("broken", "garbage")] + [e for e in cases if not e["ok"]]
        if bad:
            errs.append(f"reference fails its own tests: {json.dumps(bad[0])[:600]}")
        if not cases:
            errs.append("no fixed cases ran")
        if len(cases) < 5:
            errs.append(f"only {len(cases)} fixed cases — need ≥5 (examples + edge cases)")
        stress = [e for e in ev if e["t"] == "stress"]
        if not stress or not stress[-1].get("ok"):
            errs.append(f"stress did not pass: {json.dumps(stress[-1] if stress else 'none')[:600]}")
        elif stress[-1]["count"] < 60:
            notes.append(f"stress ran only {stress[-1]['count']} cases")
        for i, ex in enumerate(p["examples"]):
            if ex.get("check", True) and i < len(cases) and norm(cases[i]["want"]) != norm(ex["output"]):
                errs.append(f"example {i + 1} says {ex['output']} but the reference returns {cases[i]['want']}")
        if bench:
            pts = [(e["n"], e["refNs"]) for e in ev if e["t"] == "bench" and e["refNs"] > 0]
            s = slope(pts)
            want = EXPONENT[p["target"]["time"]]
            top = max((ns for _, ns in pts), default=0)
            if s is None:
                errs.append(f"bench too small to measure (largest reference time {top / 1e6:.2f} ms) — raise bench.max or make bench() heavier")
            else:
                notes.append(f"reference grows like n^{s:.2f} (target {p['target']['time']}), {top / 1e6:.1f} ms at n={pts[-1][0]}")
                if abs(s - want) > 0.45:
                    errs.append(f"reference measured n^{s:.2f} but target.time is {p['target']['time']} — fix bench() or the target")
        else:
            notes.append("benchmark skipped (--no-bench)" if NO_BENCH else "no benchmark")

        ev, err = run(w, p["starter"], "test", None)
        if ev is None:
            errs.append(f"starter does not compile:\n{err[:1500]}")
        elif all(e.get("ok", True) for e in ev if e["t"] == "case"):
            errs.append("the starter passes every fixed case — the tests have no teeth")
    return errs, notes


def validate_drills():
    errs = []
    path = os.path.join(HERE, "drills", "drills.json")
    if not os.path.exists(path):
        return ["drills/drills.json missing"], 0
    drills = json.load(open(path))
    for dr in drills:
        for k in ["id", "topic", "title", "explanation", "output"]:
            if k not in dr:
                errs.append(f"drill {dr.get('id')}: missing '{k}'")
        src = os.path.join(HERE, "drills", f"{dr.get('id')}.java")
        if not os.path.exists(src):
            errs.append(f"drill {dr.get('id')}: missing {dr.get('id')}.java")
            continue
        with tempfile.TemporaryDirectory() as w:
            shutil.copy(src, os.path.join(w, "Main.java"))
            c = subprocess.run([os.path.join(JDK, "javac"), "--release", "17", "-d", w, os.path.join(w, "Main.java")], capture_output=True, text=True)
            if c.returncode:
                errs.append(f"drill {dr['id']}: does not compile: {c.stderr[:500]}")
                continue
            r = subprocess.run([os.path.join(JDK, "java"), "-cp", w, "Main"], capture_output=True, text=True, timeout=20)
            actual = r.stdout.rstrip("\n")
            if r.returncode:
                errs.append(f"drill {dr['id']}: exits {r.returncode} — catch exceptions and print them instead: {r.stderr[:300]}")
            elif actual != dr.get("output", "").rstrip("\n"):
                errs.append(f"drill {dr['id']}: stored output {dr.get('output')!r} but Java prints {actual!r}")
    return errs, len(drills)


def main():
    if not JDK:
        sys.exit("no JDK found (brew install openjdk@17)")
    global NO_BENCH
    args = sys.argv[1:]
    if "--no-bench" in args:
        NO_BENCH = True
        args.remove("--no-bench")
    failed = 0
    if args != ["--drills"]:
        ids = args or sorted(x for x in os.listdir(os.path.join(HERE, "problems")) if not x.startswith("."))
        for pid in ids:
            errs, notes = validate_problem(pid)
            print(f"{'FAIL' if errs else 'ok  '} {pid}" + (f"  ({'; '.join(notes)})" if notes else ""))
            for e in errs:
                print(f"     ✗ {e}")
            failed += bool(errs)
    if not args or args == ["--drills"]:
        errs, n = validate_drills()
        print(f"{'FAIL' if errs else 'ok  '} drills ({n})")
        for e in errs:
            print(f"     ✗ {e}")
        failed += bool(errs)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
