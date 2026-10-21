//! CODE: interview practice in Java, judged by running Java.
//!
//! Correctness, counterexamples and complexity all come from executing the user's
//! code against a reference solution (`code/harness`, `code/problems`). The local
//! model plays the interviewer and is handed the judge's facts; it never decides
//! whether code works. Progress is spaced repetition: a clean solve pushes the next
//! review out, a hint, a peek or a slow solution brings it back tomorrow.

use crate::agents::{self, ChatEvent, ChatMsg, Inflight};
use crate::config;
use crate::error::{Error, Result};
use include_dir::{include_dir, Dir};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeSet, HashMap};
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::time::{Duration, Instant};
use tauri::ipc::Channel;
use tauri::State;
use tokio::process::Command;

static CODE: Dir<'static> = include_dir!("$CARGO_MANIFEST_DIR/code");

// ---------- content ----------

#[derive(Deserialize, Serialize, Clone)]
pub struct Example {
    pub input: String,
    pub output: String,
}

#[derive(Deserialize, Serialize, Clone, Default)]
pub struct Target {
    pub time: String,
    #[serde(default)]
    pub space: String,
    #[serde(default)]
    pub note: String,
}

#[derive(Deserialize, Serialize, Clone, Copy)]
pub struct Bench {
    pub min: u64,
    pub max: u64,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Problem {
    pub id: String,
    pub title: String,
    pub pattern: String,
    pub difficulty: String,
    pub statement: String,
    pub examples: Vec<Example>,
    #[serde(default)]
    pub constraints: Vec<String>,
    #[serde(default)]
    pub params: Vec<String>,
    pub starter: String,
    pub target: Target,
    #[serde(default)]
    pub bench_n: String,
    #[serde(default)]
    pub bench: Option<Bench>,
    pub hints: Vec<String>,
    #[serde(default)]
    pub followups: Vec<String>,
    pub explain: String,
    #[serde(default)]
    pub tags: Vec<String>,
}

fn problems() -> &'static [Problem] {
    static P: OnceLock<Vec<Problem>> = OnceLock::new();
    P.get_or_init(|| {
        let mut out: Vec<Problem> = CODE
            .get_dir("problems")
            .map(|d| {
                d.dirs()
                    .filter_map(|p| p.get_file(p.path().join("problem.json")))
                    .filter_map(|f| serde_json::from_slice(f.contents()).ok())
                    .collect()
            })
            .unwrap_or_default();
        let rank = |d: &str| ["easy", "medium", "hard"].iter().position(|x| *x == d).unwrap_or(3);
        out.sort_by(|a, b| {
            pattern_rank(&a.pattern).cmp(&pattern_rank(&b.pattern)).then(rank(&a.difficulty).cmp(&rank(&b.difficulty))).then(a.title.cmp(&b.title))
        });
        out
    })
}

const PATTERN_ORDER: [&str; 14] = [
    "hashing", "two-pointers", "sliding-window", "stack", "binary-search", "linked-list", "trees",
    "heap", "graphs", "backtracking", "dp", "dp2", "intervals", "design",
];
fn pattern_rank(p: &str) -> usize {
    PATTERN_ORDER.iter().position(|x| *x == p).unwrap_or(99)
}

fn problem(id: &str) -> Result<&'static Problem> {
    problems().iter().find(|p| p.id == id).ok_or_else(|| Error::msg(format!("unknown problem '{id}'")))
}

fn embedded_json(path: &str) -> serde_json::Value {
    CODE.get_file(path).and_then(|f| serde_json::from_slice(f.contents()).ok()).unwrap_or(serde_json::Value::Array(vec![]))
}

#[derive(Deserialize, Clone)]
struct Drill {
    id: String,
    topic: String,
    title: String,
    #[serde(default)]
    difficulty: String,
    explanation: String,
    output: String,
}

fn drills() -> &'static [Drill] {
    static D: OnceLock<Vec<Drill>> = OnceLock::new();
    D.get_or_init(|| serde_json::from_value(embedded_json("drills/drills.json")).unwrap_or_default())
}

// ---------- storage ----------

fn root() -> PathBuf {
    config::config_path().parent().map(Path::to_path_buf).unwrap_or_default().join("code")
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Prog {
    /// "" (new), "attempted" or "solved"
    pub status: String,
    pub attempts: u32,
    pub solves: u32,
    pub last_attempt: Option<String>,
    pub last_solved: Option<String>,
    pub interval_days: f64,
    /// YYYY-MM-DD the next review is due
    pub due: Option<String>,
    /// Hints opened since the last solve.
    pub hints_used: u32,
    /// Looked at the solution since the last solve.
    pub revealed: bool,
    pub best_secs: Option<u64>,
    /// The last solve passed but measured slower than the target.
    pub slow: bool,
}

fn load_progress() -> HashMap<String, Prog> {
    std::fs::read(root().join("progress.json")).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default()
}

fn save_progress(p: &HashMap<String, Prog>) -> Result<()> {
    std::fs::create_dir_all(root())?;
    let tmp = root().join("progress.json.tmp");
    std::fs::write(&tmp, serde_json::to_vec_pretty(p)?)?;
    std::fs::rename(tmp, root().join("progress.json"))?;
    Ok(())
}

fn append(file: &str, v: &serde_json::Value) {
    use std::io::Write;
    let _ = std::fs::create_dir_all(root());
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(root().join(file)) {
        let _ = writeln!(f, "{v}");
    }
}

fn read_lines(file: &str) -> Vec<serde_json::Value> {
    std::fs::read_to_string(root().join(file))
        .map(|s| s.lines().filter_map(|l| serde_json::from_str(l).ok()).collect())
        .unwrap_or_default()
}

fn draft_path(id: &str) -> PathBuf {
    root().join("drafts").join(format!("{id}.java"))
}

fn today() -> chrono::NaiveDate {
    chrono::Local::now().date_naive()
}

fn is_due(p: &Prog, on: chrono::NaiveDate) -> bool {
    p.status == "solved" && p.due.as_deref().and_then(|d| d.parse::<chrono::NaiveDate>().ok()).is_none_or(|d| d <= on)
}

// ---------- the JDK ----------

/// A JDK's bin directory. Never the /usr/bin stubs: with no JDK installed they pop
/// a "install Java" dialog instead of failing.
pub(crate) fn jdk() -> Option<PathBuf> {
    let mut c: Vec<PathBuf> = Vec::new();
    if let Ok(h) = std::env::var("JAVA_HOME") {
        c.push(PathBuf::from(h).join("bin"));
    }
    for v in ["openjdk@21", "openjdk@17", "openjdk"] {
        c.push(PathBuf::from(format!("/opt/homebrew/opt/{v}/bin")));
        c.push(PathBuf::from(format!("/usr/local/opt/{v}/bin")));
    }
    if let Ok(rd) = std::fs::read_dir("/Library/Java/JavaVirtualMachines") {
        let mut v: Vec<PathBuf> = rd.flatten().map(|e| e.path().join("Contents/Home/bin")).collect();
        v.sort();
        c.extend(v.into_iter().rev());
    }
    c.into_iter().find(|b| b.join("javac").exists() && b.join("java").exists())
}

// ---------- judging ----------

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct CaseResult {
    pub i: u32,
    pub ok: bool,
    pub ms: f64,
    pub input: Vec<String>,
    pub want: String,
    pub got: Option<String>,
    pub error: Option<String>,
    pub line: Option<u32>,
    pub stdout: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct CompileError {
    pub line: u32,
    pub msg: String,
    pub context: String,
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct BenchPt {
    pub n: u64,
    pub ns: i64,
    pub ref_ns: i64,
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Complexity {
    pub slope: Option<f64>,
    pub ref_slope: Option<f64>,
    pub label: String,
    pub target: String,
    /// "ok", "slow", "timeout" or "fast" (too quick to measure)
    pub verdict: String,
    pub ratio: Option<f64>,
    pub at_n: Option<u64>,
    pub detail: String,
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Lint {
    pub line: u32,
    pub rule: String,
    pub msg: String,
    /// "warn" (a bug or an interviewer red flag) or "info" (style)
    pub severity: String,
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct RunResult {
    pub id: String,
    pub full: bool,
    pub compiled: bool,
    pub compile_errors: Vec<CompileError>,
    pub cases: Vec<CaseResult>,
    pub stress_ok: Option<bool>,
    pub stress_count: u32,
    pub stress_fail: Option<CaseResult>,
    pub bench: Vec<BenchPt>,
    pub complexity: Option<Complexity>,
    pub lint: Vec<Lint>,
    /// Every fixed case (and stress, on a full run) passed.
    pub passed: bool,
    /// A full run that passed: counts as solving the problem.
    pub solved: bool,
    pub broken: Option<String>,
    pub judge_ms: u64,
    pub progress: Option<Prog>,
}

fn harness_dir(p: &Problem, code: &str) -> Result<PathBuf> {
    let dir = root().join("runs").join(&p.id);
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir)?;
    let h = CODE.get_dir("harness").ok_or_else(|| Error::msg("harness missing from the build"))?;
    for f in h.files() {
        if let Some(name) = f.path().file_name() {
            std::fs::write(dir.join(name), f.contents())?;
        }
    }
    for name in ["Ref.java", "Cases.java"] {
        let f = CODE
            .get_file(format!("problems/{}/{name}", p.id))
            .ok_or_else(|| Error::msg(format!("{} is missing {name}", p.id)))?;
        std::fs::write(dir.join(name), f.contents())?;
    }
    std::fs::write(dir.join("Solution.java"), code)?;
    Ok(dir)
}

/// Compiles and runs `code` against the problem. `full` adds the stress test and the benchmark.
pub(crate) async fn judge(p: &Problem, code: &str, full: bool) -> Result<RunResult> {
    let bin = jdk().ok_or_else(|| Error::msg("No JDK found. Install one with: brew install openjdk@17"))?;
    let t0 = Instant::now();
    let dir = harness_dir(p, code)?;
    let mut res = RunResult { id: p.id.clone(), full, lint: lint(code), ..Default::default() };

    let srcs: Vec<PathBuf> = std::fs::read_dir(&dir)?
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|x| x == "java"))
        .collect();
    let out = dir.join("out");
    let compile = Command::new(bin.join("javac"))
        .args(["--release", "17", "-encoding", "UTF-8", "-nowarn", "-Xmaxerrs", "12", "-d"])
        .arg(&out)
        .args(&srcs)
        .current_dir(&dir)
        .kill_on_drop(true)
        .output();
    let c = tokio::time::timeout(Duration::from_secs(60), compile)
        .await
        .map_err(|_| Error::msg("javac took over a minute"))??;
    if !c.status.success() {
        res.compile_errors = compile_errors(&String::from_utf8_lossy(&c.stderr), &p.starter);
        res.judge_ms = t0.elapsed().as_millis() as u64;
        return Ok(res);
    }
    res.compiled = true;

    let (bmin, bmax) = match (full, p.bench) {
        (true, Some(b)) => (b.min, b.max),
        _ => (0, 0),
    };
    let run = Command::new(bin.join("java"))
        .args(["-Xmx768m", "-XX:+UseSerialGC", "-cp"])
        .arg(&out)
        .args(["Runner", if full { "full" } else { "test" }, &bmin.to_string(), &bmax.to_string(), "4000"])
        .current_dir(&dir)
        .kill_on_drop(true)
        .output();
    let r = match tokio::time::timeout(Duration::from_secs(if full { 90 } else { 40 }), run).await {
        Ok(r) => r?,
        Err(_) => {
            res.broken = Some("The judge didn't finish in time — something is running far too long.".into());
            res.judge_ms = t0.elapsed().as_millis() as u64;
            return Ok(res);
        }
    };
    parse_events(&String::from_utf8_lossy(&r.stdout), &mut res);
    if res.cases.is_empty() && res.broken.is_none() {
        let err = String::from_utf8_lossy(&r.stderr);
        res.broken = Some(format!("The judge produced no results. {}", err.lines().take(4).collect::<Vec<_>>().join(" ")));
    }
    let fixed_ok = !res.cases.is_empty() && res.cases.iter().all(|c| c.ok);
    res.passed = fixed_ok && (!full || res.stress_ok.unwrap_or(true));
    res.solved = full && res.passed;
    if full && res.passed {
        res.complexity = Some(complexity(&res.bench, &p.target.time));
    }
    res.judge_ms = t0.elapsed().as_millis() as u64;
    Ok(res)
}

fn parse_events(stdout: &str, res: &mut RunResult) {
    for line in stdout.lines() {
        let Ok(v) = serde_json::from_str::<serde_json::Value>(line) else { continue };
        match v["t"].as_str().unwrap_or("") {
            "case" => res.cases.push(case_of(&v)),
            "stress" => {
                if v["ok"].as_bool() == Some(true) {
                    res.stress_ok = Some(true);
                    res.stress_count = v["count"].as_u64().unwrap_or(0) as u32;
                } else {
                    res.stress_ok = Some(false);
                    res.stress_count = v["i"].as_u64().unwrap_or(0) as u32;
                    res.stress_fail = Some(case_of(&v));
                }
            }
            "bench" => res.bench.push(BenchPt {
                n: v["n"].as_u64().unwrap_or(0),
                ns: v["ns"].as_i64().unwrap_or(-1),
                ref_ns: v["refNs"].as_i64().unwrap_or(-1),
            }),
            "broken" => res.broken = Some(format!("This problem's tests are broken: {}", v["msg"].as_str().unwrap_or(""))),
            _ => {}
        }
    }
}

fn case_of(v: &serde_json::Value) -> CaseResult {
    CaseResult {
        i: v["i"].as_u64().unwrap_or(0) as u32,
        ok: v["ok"].as_bool().unwrap_or(false),
        ms: v["ms"].as_f64().unwrap_or(0.0),
        input: v["in"].as_array().map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect()).unwrap_or_default(),
        want: v["want"].as_str().unwrap_or("").to_string(),
        got: v["got"].as_str().map(String::from),
        error: v["error"].as_str().map(String::from),
        line: v["at"].as_str().and_then(|a| a.strip_prefix("Solution.java:")).and_then(|n| n.parse().ok()),
        stdout: v["stdout"].as_str().filter(|s| !s.is_empty()).map(String::from),
    }
}

/// javac's errors in your file, with the source line and caret it prints under each.
/// An error in the harness means the class or signature no longer matches the starter.
fn compile_errors(stderr: &str, starter: &str) -> Vec<CompileError> {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = RE.get_or_init(|| Regex::new(r"^(?:.*/)?(\w+)\.java:(\d+): error: (.*)$").unwrap());
    let lines: Vec<&str> = stderr.lines().collect();
    let mut out = Vec::new();
    let mut harness = false;
    for (i, l) in lines.iter().enumerate() {
        let Some(c) = re.captures(l) else { continue };
        if &c[1] != "Solution" {
            harness = true;
            continue;
        }
        let context = lines[i + 1..].iter().take(2).take_while(|x| !re.is_match(x)).copied().collect::<Vec<_>>().join("\n");
        out.push(CompileError { line: c[2].parse().unwrap_or(0), msg: c[3].to_string(), context });
    }
    if harness && out.is_empty() {
        let sig: Vec<&str> = starter.lines().map(str::trim).filter(|l| l.contains('(') && (l.starts_with("public") || l.contains(" class "))).collect();
        out.push(CompileError {
            line: 0,
            msg: "The tests can't call your code: keep the class name and method signature from the starter.".into(),
            context: sig.join("\n"),
        });
    }
    if out.is_empty() {
        out.push(CompileError { line: 0, msg: stderr.lines().take(6).collect::<Vec<_>>().join("\n"), context: String::new() });
    }
    out
}

// ---------- complexity ----------

fn expected_exponent(t: &str) -> Option<f64> {
    Some(match t {
        "1" => 0.0,
        "log n" => 0.1,
        "n" => 1.0,
        "n log n" => 1.08,
        "n^2" => 2.0,
        "n^3" => 3.0,
        _ => return None,
    })
}

/// Least-squares slope of log(time) on log(n) over up to the six largest points
/// that took at least half a millisecond — below that, timer noise dominates.
pub(crate) fn slope(points: &[(u64, i64)]) -> Option<f64> {
    let pts: Vec<(f64, f64)> = points.iter().filter(|(_, ns)| *ns >= 500_000).map(|(n, ns)| ((*n as f64).ln(), (*ns as f64).ln())).collect();
    let pts = &pts[pts.len().saturating_sub(6)..];
    if pts.len() < 2 {
        return None;
    }
    let k = pts.len() as f64;
    let (mx, my) = (pts.iter().map(|p| p.0).sum::<f64>() / k, pts.iter().map(|p| p.1).sum::<f64>() / k);
    let den: f64 = pts.iter().map(|p| (p.0 - mx).powi(2)).sum();
    (den > 0.0).then(|| pts.iter().map(|p| (p.0 - mx) * (p.1 - my)).sum::<f64>() / den)
}

fn growth_label(s: f64) -> &'static str {
    match s {
        s if s < 0.4 => "O(1) or O(log n)",
        s if s < 1.4 => "O(n) or O(n log n)",
        s if s < 1.75 => "between O(n log n) and O(n²)",
        s if s < 2.5 => "O(n²)",
        _ => "O(n³) or worse",
    }
}

fn big_o(t: &str) -> String {
    format!("O({})", sup(t))
}

/// n^2 → n², 2^n → 2ⁿ, 3^L → 3ᴸ: how the bound would be written on a whiteboard.
fn sup(t: &str) -> String {
    let mut out = String::new();
    let mut it = t.chars().peekable();
    while let Some(c) = it.next() {
        if let (true, Some(&n)) = (c == '^', it.peek()) {
            out.push(match n { '2' => '²', '3' => '³', 'n' => 'ⁿ', 'k' => 'ᵏ', 't' => 'ᵗ', 'L' => 'ᴸ', 'm' => 'ᵐ', _ => n });
            it.next();
            continue;
        }
        out.push(c);
    }
    out
}

fn fmt_ns(ns: i64) -> String {
    match ns {
        n if n >= 1_000_000_000 => format!("{:.2} s", n as f64 / 1e9),
        n if n >= 1_000_000 => format!("{:.1} ms", n as f64 / 1e6),
        n => format!("{:.0} µs", n as f64 / 1e3),
    }
}

fn fmt_n(n: u64) -> String {
    let s = n.to_string();
    let mut out = String::new();
    for (i, ch) in s.chars().enumerate() {
        if i > 0 && (s.len() - i).is_multiple_of(3) {
            out.push(',');
        }
        out.push(ch);
    }
    out
}

pub(crate) fn complexity(bench: &[BenchPt], target: &str) -> Complexity {
    let mine: Vec<(u64, i64)> = bench.iter().filter(|b| b.ns > 0).map(|b| (b.n, b.ns)).collect();
    let refs: Vec<(u64, i64)> = bench.iter().filter(|b| b.ref_ns > 0).map(|b| (b.n, b.ref_ns)).collect();
    let s = slope(&mine);
    let rs = slope(&refs);
    let last = bench.iter().rfind(|b| b.ns > 0 && b.ref_ns > 0);
    let ratio = last.map(|b| b.ns as f64 / b.ref_ns.max(1) as f64);
    let tgt = big_o(target);
    let mut c = Complexity { slope: s, ref_slope: rs, target: target.into(), ratio, at_n: last.map(|b| b.n), ..Default::default() };
    let at = last.map(|b| format!(" At n = {}, yours took {} and the reference {}.", fmt_n(b.n), fmt_ns(b.ns), fmt_ns(b.ref_ns))).unwrap_or_default();

    if let Some(t) = bench.iter().find(|b| b.ns < 0) {
        c.verdict = "timeout".into();
        c.label = "too slow to finish".into();
        c.detail = format!("Timed out on the benchmark at n = {}. The target is {tgt}.{at}", fmt_n(t.n));
        return c;
    }
    let Some(s) = s else {
        c.verdict = "fast".into();
        c.label = "too fast to measure".into();
        c.detail = if bench.is_empty() {
            "No benchmark for this problem — talk through the complexity instead.".into()
        } else {
            format!("Too fast to measure at these sizes, which is consistent with the {tgt} target.{at}")
        };
        return c;
    };
    c.label = growth_label(s).into();
    let exp = expected_exponent(target).unwrap_or(s);
    let gap = s - exp;
    let much_slower = ratio.unwrap_or(1.0) > 20.0;
    if gap > 0.5 || (gap > 0.3 && much_slower) {
        c.verdict = "slow".into();
        c.detail = format!("Grows like n^{s:.2}, which looks like {}. The target is {tgt}.{at}", growth_label(s));
    } else {
        c.verdict = "ok".into();
        c.detail = format!("Grows like n^{s:.2}: consistent with the {tgt} target.{at}");
    }
    c
}

// ---------- Java lint ----------

struct Rule {
    id: &'static str,
    re: &'static str,
    sev: &'static str,
    msg: &'static str,
}

const RULES: &[Rule] = &[
    Rule { id: "legacy-stack", re: r"\bnew\s+Stack\s*<", sev: "warn",
        msg: "java.util.Stack is a synchronized legacy class. Use Deque<Integer> st = new ArrayDeque<>(); push, pop and peek work the same." },
    Rule { id: "legacy-collection", re: r"\b(?:Vector|Hashtable)\s*<", sev: "warn",
        msg: "Vector and Hashtable are legacy synchronized collections. Use ArrayList and HashMap." },
    Rule { id: "midpoint-overflow", re: r"\(\s*\w+\s*\+\s*\w+\s*\)\s*/\s*2\b", sev: "warn",
        msg: "(lo + hi) / 2 overflows when both are large. Write lo + (hi - lo) / 2, or (lo + hi) >>> 1." },
    Rule { id: "comparator-subtraction", re: r"\(\s*\w+\s*,\s*\w+\s*\)\s*->\s*[\w.\[\]()]+\s*-\s*[\w.\[\]()]+\s*[),]", sev: "warn",
        msg: "A comparator written as a - b overflows for large or negative values and silently mis-sorts. Use Integer.compare(a, b) or Comparator.comparingInt(...)." },
    Rule { id: "string-identity", re: r#"(?:"[^"\n]*"\s*[!=]=)|(?:[!=]=\s*"[^"\n]*")"#, sev: "warn",
        msg: "== on Strings compares references, not text. Use .equals()." },
    Rule { id: "boxed-identity", re: r"\.(?:get|peek|peekFirst|peekLast|getKey|getValue|poll)\([^()]*\)\s*[!=]=\s*\w+\.(?:get|peek|peekFirst|peekLast|getKey|getValue)\(", sev: "warn",
        msg: "This compares two boxed Integers with ==, which checks identity. It works for −128..127 (the Integer cache) and silently fails above. Use .equals(), or unbox to int first." },
    Rule { id: "max-value-overflow", re: r"Integer\.MAX_VALUE\s*\+", sev: "warn",
        msg: "Integer.MAX_VALUE + anything wraps to a negative number. Use long, or compare before adding." },
    Rule { id: "split-regex", re: r#"\.split\(\s*"[.|+*?^$]"\s*\)"#, sev: "warn",
        msg: r#"split() takes a regex: split(".") or split("|") splits on every character. Escape it, e.g. split("\\.")."# },
    Rule { id: "empty-catch", re: r"catch\s*\([^)]*\)\s*\{\s*\}", sev: "warn",
        msg: "An empty catch swallows the error you'd want to see." },
    Rule { id: "boxed-counter", re: r"for\s*\(\s*(?:Integer|Long)\s+\w+\s*=", sev: "warn",
        msg: "Boxed loop counter: every ++ unboxes and re-boxes. Use int." },
    Rule { id: "char-map", re: r"Map\s*<\s*Character\s*,\s*Integer\s*>", sev: "info",
        msg: "If the alphabet is fixed (say lowercase letters), an int[26] indexed by c - 'a' is faster and shorter than Map<Character, Integer>." },
    Rule { id: "linkedlist-queue", re: r"Queue\s*<[^>]*>\s+\w+\s*=\s*new\s+LinkedList", sev: "info",
        msg: "ArrayDeque is the faster queue; LinkedList allocates a node per element." },
    Rule { id: "math-pow", re: r"Math\.pow\(", sev: "info",
        msg: "Math.pow works in doubles. For integer powers, multiply or shift: doubles lose precision above 2^53." },
    Rule { id: "size-zero", re: r"\.size\(\)\s*==\s*0", sev: "info",
        msg: "isEmpty() says this more directly." },
    Rule { id: "debug-print", re: r"System\.out\.print", sev: "info",
        msg: "Debug prints are still in. Fine while you work, but take them out before you say you're done (they also slow the benchmark)." },
];

/// Blanks out comments, keeping string literals and line numbers intact.
fn strip_comments(src: &str) -> String {
    let b = src.as_bytes();
    let mut out = String::with_capacity(src.len());
    let mut i = 0;
    while i < b.len() {
        let c = b[i] as char;
        if c == '"' || c == '\'' {
            let q = b[i];
            out.push(c);
            i += 1;
            while i < b.len() && b[i] != q && b[i] != b'\n' {
                if b[i] == b'\\' && i + 1 < b.len() {
                    out.push(b[i] as char);
                    i += 1;
                }
                out.push(b[i] as char);
                i += 1;
            }
            if i < b.len() {
                out.push(b[i] as char);
                i += 1;
            }
        } else if c == '/' && b.get(i + 1) == Some(&b'/') {
            while i < b.len() && b[i] != b'\n' {
                out.push(' ');
                i += 1;
            }
        } else if c == '/' && b.get(i + 1) == Some(&b'*') {
            while i < b.len() && !(b[i] == b'*' && b.get(i + 1) == Some(&b'/')) {
                out.push(if b[i] == b'\n' { '\n' } else { ' ' });
                i += 1;
            }
            out.push_str("  ");
            i += 2;
        } else {
            // multi-byte UTF-8 passes through untouched
            let ch = src[i..].chars().next().unwrap_or(' ');
            out.push(ch);
            i += ch.len_utf8();
        }
    }
    out
}

pub(crate) fn lint(src: &str) -> Vec<Lint> {
    static COMPILED: OnceLock<Vec<(&'static Rule, Regex)>> = OnceLock::new();
    let rules = COMPILED.get_or_init(|| RULES.iter().map(|r| (r, Regex::new(r.re).unwrap())).collect());
    let code = strip_comments(src);
    let line_of = |at: usize| code[..at].matches('\n').count() as u32 + 1;
    let mut out = Vec::new();
    for (r, re) in rules {
        for m in re.find_iter(&code).take(2) {
            out.push(Lint { line: line_of(m.start()), rule: r.id.into(), msg: r.msg.into(), severity: r.sev.into() });
        }
    }
    // Rules that need to know a variable's declared type (the regex crate has no backreferences).
    let has_loop = Regex::new(r"\b(?:for|while)\s*\(").unwrap().is_match(&code);
    let decl = |ty: &str| -> Vec<String> {
        Regex::new(&format!(r"\b{ty}\s+(\w+)\s*[=;]"))
            .unwrap()
            .captures_iter(&code)
            .map(|c| c[1].to_string())
            .collect()
    };
    let mut once = |rule: &str, sev: &str, msg: String, pat: String| {
        if let Some(m) = Regex::new(&pat).unwrap().find(&code) {
            out.push(Lint { line: line_of(m.start()), rule: rule.into(), msg, severity: sev.into() });
        }
    };
    if has_loop {
        for v in decl("String") {
            once("string-concat-loop", "warn",
                format!("`{v} +=` on a String copies the whole string every time, so a loop of these is O(n²). Use a StringBuilder."),
                format!(r"\b{v}\s*\+="));
        }
        for v in decl(r"(?:List|ArrayList|LinkedList)\s*<[^>]*>") {
            once("list-contains", "info",
                format!("{v}.contains() scans the whole list. In a loop that's O(n²); a HashSet makes membership O(1)."),
                format!(r"\b{v}\.contains\("));
        }
    }
    for v in decl(r"(?:List\s*<[^>]*>|LinkedList\s*<[^>]*>)").into_iter().filter(|v| Regex::new(&format!(r"\b{v}\s*=\s*new\s+LinkedList")).unwrap().is_match(&code)) {
        once("linkedlist-get", "warn",
            format!("{v} is a LinkedList, and {v}.get(i) walks from the head, so it's O(n). Use ArrayList for indexing."),
            format!(r"\b{v}\.get\("));
    }
    out.sort_by_key(|l| (l.severity != "warn", l.line));
    out.dedup_by(|a, b| a.rule == b.rule && a.line == b.line);
    out
}

// ---------- spaced repetition ----------

fn record(p: &Problem, res: &RunResult, elapsed_secs: u64, mock: bool) -> Prog {
    let mut all = load_progress();
    let pr = all.entry(p.id.clone()).or_default();
    let now = chrono::Local::now();
    pr.attempts += 1;
    pr.last_attempt = Some(now.to_rfc3339());
    if pr.status.is_empty() {
        pr.status = "attempted".into();
    }
    let verdict = res.complexity.as_ref().map(|c| c.verdict.clone()).unwrap_or_default();
    if res.solved {
        let slow = verdict == "slow" || verdict == "timeout";
        let clean = pr.hints_used == 0 && !pr.revealed && !slow;
        pr.interval_days = match (clean, pr.solves) {
            (false, _) => 1.0,
            (true, 0) => 3.0,
            (true, _) => (pr.interval_days.max(1.0) * 2.5).min(60.0),
        };
        pr.due = Some((today() + chrono::Duration::days(pr.interval_days.round() as i64)).to_string());
        pr.status = "solved".into();
        pr.solves += 1;
        pr.last_solved = Some(now.to_rfc3339());
        pr.slow = slow;
        if clean && elapsed_secs > 0 {
            pr.best_secs = Some(pr.best_secs.map_or(elapsed_secs, |b| b.min(elapsed_secs)));
        }
    }
    let snapshot = pr.clone();
    if res.solved {
        pr.hints_used = 0;
        pr.revealed = false;
    }
    let out = pr.clone();
    let _ = save_progress(&all);
    append("attempts.jsonl", &serde_json::json!({
        "at": now.to_rfc3339(), "id": p.id, "title": p.title, "pattern": p.pattern, "full": res.full,
        "passed": res.passed, "solved": res.solved, "mock": mock,
        "cases": res.cases.iter().filter(|c| c.ok).count(), "total": res.cases.len(),
        "verdict": verdict, "slope": res.complexity.as_ref().and_then(|c| c.slope),
        "hints": snapshot.hints_used, "revealed": snapshot.revealed, "secs": elapsed_secs,
        "compiled": res.compiled,
    }));
    out
}

// ---------- commands: problems ----------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProblemSummary {
    id: String,
    title: String,
    pattern: String,
    difficulty: String,
    target: String,
    tags: Vec<String>,
    progress: Prog,
    due: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PatternStat {
    id: String,
    total: usize,
    solved: usize,
    due: usize,
    /// Fully solved and not overdue counts 1, solved but due 0.5.
    mastery: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Plan {
    due: Vec<String>,
    next: Option<String>,
    next_reason: String,
    drills: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Overview {
    java: Option<String>,
    problems: Vec<ProblemSummary>,
    patterns: Vec<PatternStat>,
    plan: Plan,
    streak: u32,
    practiced_today: bool,
    solved: usize,
    drills_correct: usize,
    drills_total: usize,
    recent: Vec<serde_json::Value>,
    mocks: Vec<serde_json::Value>,
}

fn drill_state() -> HashMap<String, (u32, bool)> {
    // id -> (attempts, ever correct)
    let mut m: HashMap<String, (u32, bool)> = HashMap::new();
    for v in read_lines("drills.jsonl") {
        let e = m.entry(v["id"].as_str().unwrap_or("").to_string()).or_default();
        e.0 += 1;
        e.1 |= v["correct"].as_bool().unwrap_or(false);
    }
    m
}

pub(crate) fn overview_now() -> Overview {
    let prog = load_progress();
    let on = today();
    let problems_v: Vec<ProblemSummary> = problems()
        .iter()
        .map(|p| {
            let pr = prog.get(&p.id).cloned().unwrap_or_default();
            ProblemSummary {
                due: is_due(&pr, on),
                id: p.id.clone(),
                title: p.title.clone(),
                pattern: p.pattern.clone(),
                difficulty: p.difficulty.clone(),
                target: p.target.time.clone(),
                tags: p.tags.clone(),
                progress: pr,
            }
        })
        .collect();
    let patterns: Vec<PatternStat> = PATTERN_ORDER
        .iter()
        .map(|id| {
            let ps: Vec<&ProblemSummary> = problems_v.iter().filter(|p| p.pattern == *id).collect();
            let solved = ps.iter().filter(|p| p.progress.status == "solved").count();
            let due = ps.iter().filter(|p| p.due).count();
            let score: f64 = ps.iter().map(|p| if p.progress.status != "solved" { 0.0 } else if p.due { 0.5 } else { 1.0 }).sum();
            PatternStat { id: id.to_string(), total: ps.len(), solved, due, mastery: if ps.is_empty() { 0.0 } else { score / ps.len() as f64 } }
        })
        .collect();

    // Today: everything due, oldest first; then one new problem from the weakest pattern.
    let mut due: Vec<&ProblemSummary> = problems_v.iter().filter(|p| p.due).collect();
    due.sort_by(|a, b| a.progress.due.cmp(&b.progress.due));
    let unfinished = problems_v.iter().filter(|p| p.progress.status == "attempted").max_by(|a, b| a.progress.last_attempt.cmp(&b.progress.last_attempt));
    let (next, next_reason) = if let Some(u) = unfinished {
        (Some(u.id.clone()), "unfinished — you started it and haven't solved it yet".to_string())
    } else {
        let weakest = patterns
            .iter()
            .filter(|s| s.solved < s.total)
            .min_by(|a, b| a.mastery.partial_cmp(&b.mastery).unwrap_or(std::cmp::Ordering::Equal).then(pattern_rank(&a.id).cmp(&pattern_rank(&b.id))));
        match weakest.and_then(|w| problems_v.iter().find(|p| p.pattern == w.id && p.progress.status.is_empty())) {
            Some(p) => (Some(p.id.clone()), format!("new · your weakest pattern is {}", p.pattern)),
            None => (None, String::new()),
        }
    };
    let ds = drill_state();
    let mut topics_seen = BTreeSet::new();
    let mut drill_plan: Vec<String> = Vec::new();
    for d in drills().iter().filter(|d| !ds.get(&d.id).is_some_and(|s| s.1)) {
        if drill_plan.len() < 3 && topics_seen.insert(d.topic.clone()) {
            drill_plan.push(d.id.clone());
        }
    }

    // Streak: consecutive days with a solve or a correct drill, ending today or yesterday.
    let mut days: BTreeSet<chrono::NaiveDate> = BTreeSet::new();
    let attempts = read_lines("attempts.jsonl");
    for v in attempts.iter().filter(|v| v["solved"].as_bool() == Some(true)) {
        if let Some(d) = v["at"].as_str().and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok()) {
            days.insert(d.with_timezone(&chrono::Local).date_naive());
        }
    }
    for v in read_lines("drills.jsonl").iter().filter(|v| v["correct"].as_bool() == Some(true)) {
        if let Some(d) = v["at"].as_str().and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok()) {
            days.insert(d.with_timezone(&chrono::Local).date_naive());
        }
    }
    let practiced_today = days.contains(&on);
    let mut streak = 0;
    let mut d = if practiced_today { on } else { on - chrono::Duration::days(1) };
    while days.contains(&d) {
        streak += 1;
        d -= chrono::Duration::days(1);
    }

    let mut mocks: Vec<serde_json::Value> = std::fs::read_dir(root().join("mocks"))
        .map(|rd| {
            rd.flatten()
                .filter_map(|e| std::fs::read(e.path()).ok())
                .filter_map(|b| serde_json::from_slice::<serde_json::Value>(&b).ok())
                .map(|mut v| {
                    if let Some(o) = v.as_object_mut() {
                        o.remove("transcript");
                    }
                    v
                })
                .collect()
        })
        .unwrap_or_default();
    mocks.sort_by(|a, b| b["at"].as_str().cmp(&a["at"].as_str()));

    Overview {
        java: jdk().map(|b| b.parent().unwrap_or(&b).display().to_string()),
        solved: problems_v.iter().filter(|p| p.progress.status == "solved").count(),
        plan: Plan { due: due.iter().take(3).map(|p| p.id.clone()).collect(), next, next_reason, drills: drill_plan },
        drills_correct: ds.values().filter(|s| s.1).count(),
        drills_total: drills().len(),
        recent: attempts.into_iter().rev().take(14).collect(),
        mocks,
        problems: problems_v,
        patterns,
        streak,
        practiced_today,
    }
}

#[tauri::command]
pub async fn code_overview() -> Result<Overview> {
    tauri::async_runtime::spawn_blocking(overview_now).await.map_err(|e| Error::msg(e.to_string()))
}

#[tauri::command]
pub fn code_patterns() -> serde_json::Value {
    embedded_json("patterns.json")
}

#[tauri::command]
pub fn code_toolkit() -> serde_json::Value {
    embedded_json("toolkit.json")
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProblemView {
    id: String,
    title: String,
    pattern: String,
    difficulty: String,
    statement: String,
    examples: Vec<Example>,
    constraints: Vec<String>,
    params: Vec<String>,
    target: Target,
    bench_n: String,
    has_bench: bool,
    hint_count: usize,
    tags: Vec<String>,
    starter: String,
    /// Your saved draft, or the starter.
    code: String,
    progress: Prog,
    /// Hints you've already opened this round, so reopening a problem shows them.
    hints: Vec<String>,
}

/// Opens a problem without its hints or solution — those come one at a time.
#[tauri::command]
pub fn code_open(id: String) -> Result<ProblemView> {
    let p = problem(&id)?;
    let pr = load_progress().get(&id).cloned().unwrap_or_default();
    let code = std::fs::read_to_string(draft_path(&id)).unwrap_or_else(|_| p.starter.clone());
    Ok(ProblemView {
        id: p.id.clone(),
        title: p.title.clone(),
        pattern: p.pattern.clone(),
        difficulty: p.difficulty.clone(),
        statement: p.statement.clone(),
        examples: p.examples.clone(),
        constraints: p.constraints.clone(),
        params: p.params.clone(),
        target: p.target.clone(),
        bench_n: p.bench_n.clone(),
        has_bench: p.bench.is_some(),
        hint_count: p.hints.len(),
        tags: p.tags.clone(),
        starter: p.starter.clone(),
        hints: p.hints.iter().take(pr.hints_used as usize).cloned().collect(),
        code,
        progress: pr,
    })
}

#[tauri::command]
pub fn code_save_draft(id: String, code: String) -> Result<()> {
    problem(&id)?;
    std::fs::create_dir_all(root().join("drafts"))?;
    std::fs::write(draft_path(&id), code)?;
    Ok(())
}

#[tauri::command]
pub async fn code_run(id: String, code: String, full: bool, elapsed_secs: u64, mock: Option<bool>) -> Result<RunResult> {
    let p = problem(&id)?;
    code_save_draft(id.clone(), code.clone())?;
    let mut res = judge(p, &code, full).await?;
    if res.broken.is_none() {
        res.progress = Some(record(p, &res, elapsed_secs, mock.unwrap_or(false)));
    }
    Ok(res)
}

/// The next hint, one level at a time. Opening one counts against a clean solve.
#[tauri::command]
pub fn code_hint(id: String, level: u32) -> Result<String> {
    let p = problem(&id)?;
    let i = (level.max(1) as usize - 1).min(p.hints.len().saturating_sub(1));
    let mut all = load_progress();
    let pr = all.entry(id).or_default();
    pr.hints_used = pr.hints_used.max(i as u32 + 1);
    save_progress(&all)?;
    Ok(p.hints.get(i).cloned().unwrap_or_default())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Reveal {
    explain: String,
    code: String,
    followups: Vec<String>,
    target: Target,
}

/// The reference solution. Looking before you've solved it this round means the
/// problem comes back tomorrow.
#[tauri::command]
pub fn code_reveal(id: String) -> Result<Reveal> {
    let p = problem(&id)?;
    let mut all = load_progress();
    let pr = all.entry(id.clone()).or_default();
    let solved_this_round = pr.status == "solved" && pr.hints_used == 0 && !pr.revealed && pr.last_solved >= pr.last_attempt;
    if !solved_this_round {
        pr.revealed = true;
        if pr.status == "solved" {
            pr.due = Some(today().to_string());
        }
        save_progress(&all)?;
    }
    let src = CODE.get_file(format!("problems/{id}/Ref.java")).and_then(|f| f.contents_utf8()).unwrap_or("");
    let re = Regex::new(r"\bRef(\w*)\b").unwrap();
    let code = re.replace_all(src, |c: &regex::Captures| if c[1].is_empty() { "Solution".to_string() } else { c[1].to_string() }).into_owned();
    Ok(Reveal { explain: p.explain.clone(), code, followups: p.followups.clone(), target: p.target.clone() })
}

#[tauri::command]
pub fn code_followups(id: String) -> Result<Vec<String>> {
    Ok(problem(&id)?.followups.clone())
}

// ---------- commands: drills ----------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DrillView {
    id: String,
    topic: String,
    title: String,
    difficulty: String,
    code: String,
    attempts: u32,
    correct: bool,
}

#[tauri::command]
pub fn code_drills() -> Vec<DrillView> {
    let st = drill_state();
    drills()
        .iter()
        .map(|d| DrillView {
            id: d.id.clone(),
            topic: d.topic.clone(),
            title: d.title.clone(),
            difficulty: d.difficulty.clone(),
            code: CODE.get_file(format!("drills/{}.java", d.id)).and_then(|f| f.contents_utf8()).unwrap_or("").to_string(),
            attempts: st.get(&d.id).map_or(0, |s| s.0),
            correct: st.get(&d.id).is_some_and(|s| s.1),
        })
        .collect()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DrillVerdict {
    correct: bool,
    /// Right apart from spacing, e.g. "[1,2]" for "[1, 2]".
    format_only: bool,
    output: String,
    explanation: String,
}

fn lines_of(s: &str) -> Vec<String> {
    let mut v: Vec<String> = s.replace("\r\n", "\n").lines().map(|l| l.trim_end().to_string()).collect();
    while v.last().is_some_and(|l| l.is_empty()) {
        v.pop();
    }
    v
}

/// The stored output is what Java actually printed when the drill was validated.
#[tauri::command]
pub fn code_drill_answer(id: String, answer: String) -> Result<DrillVerdict> {
    let d = drills().iter().find(|d| d.id == id).ok_or_else(|| Error::msg(format!("unknown drill '{id}'")))?;
    let want = lines_of(&d.output);
    let got = lines_of(&answer);
    let exact = want.iter().map(|l| l.trim_start()).eq(got.iter().map(|l| l.trim_start()));
    let squash = |v: &[String]| v.concat().chars().filter(|c| !c.is_whitespace()).collect::<String>();
    let format_only = !exact && squash(&want) == squash(&got);
    let correct = exact || format_only;
    append("drills.jsonl", &serde_json::json!({ "at": chrono::Local::now().to_rfc3339(), "id": id, "topic": d.topic, "correct": correct }));
    Ok(DrillVerdict { correct, format_only, output: d.output.clone(), explanation: d.explanation.clone() })
}

// ---------- the interviewer ----------

fn numbered(code: &str) -> String {
    code.lines().enumerate().map(|(i, l)| format!("{:>3} | {l}", i + 1)).collect::<Vec<_>>().join("\n")
}

/// What the judge established, in plain sentences, for the model to rely on.
pub(crate) fn summarize(p: &Problem, r: &RunResult) -> String {
    if let Some(b) = &r.broken {
        return format!("The judge could not run: {b}");
    }
    if !r.compiled {
        let e = r.compile_errors.first().map(|e| format!("line {}: {}", e.line, e.msg)).unwrap_or_default();
        return format!("It does not compile ({} error(s)). First: {e}", r.compile_errors.len());
    }
    let ok = r.cases.iter().filter(|c| c.ok).count();
    let mut s = format!("{} run: {ok}/{} fixed test cases pass.", if r.full { "Full" } else { "Quick" }, r.cases.len());
    let show = |c: &CaseResult| {
        let args = c.input.iter().enumerate().map(|(i, v)| format!("{} = {v}", p.params.get(i).map(String::as_str).unwrap_or("arg"))).collect::<Vec<_>>().join(", ");
        match (&c.error, &c.got) {
            (Some(e), _) => format!("on input {args} it threw {e}{}", c.line.map(|l| format!(" at line {l}")).unwrap_or_default()),
            (None, Some(g)) => format!("on input {args} it returned {g} but the answer is {}", c.want),
            _ => format!("on input {args} it failed"),
        }
    };
    if let Some(c) = r.cases.iter().find(|c| !c.ok) {
        s.push_str(&format!(" First failure: {}.", show(c)));
    }
    match (&r.stress_ok, &r.stress_fail) {
        (Some(true), _) => s.push_str(&format!(" Stress test: {} random inputs all match the reference.", r.stress_count)),
        (Some(false), Some(c)) => s.push_str(&format!(" Stress test found a counterexample: {}.", show(c))),
        _ => {}
    }
    if let Some(c) = &r.complexity {
        s.push_str(&format!(" Measured complexity: {}", c.detail));
    }
    let warns: Vec<&Lint> = r.lint.iter().filter(|l| l.severity == "warn").take(3).collect();
    if !warns.is_empty() {
        s.push_str(" Java issues the linter found: ");
        s.push_str(&warns.iter().map(|l| format!("line {}: {}", l.line, l.msg)).collect::<Vec<_>>().join(" "));
    }
    s
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InterviewCtx {
    code: String,
    last_run: Option<RunResult>,
    elapsed_secs: u64,
    hints_used: u32,
    /// "mock" (a timed interview) or "tutor" (practice)
    mode: String,
}

fn interviewer_system(p: &Problem, ctx: &InterviewCtx) -> String {
    let mins = ctx.elapsed_secs / 60;
    let role = if ctx.mode == "mock" {
        format!(
            "You are a senior software engineer running a 45-minute coding interview, in Java, for a SWE internship. \
             {mins} minutes have passed. Run it like a real interview: in the first ~5 minutes he should restate the problem \
             and ask clarifying questions; by ~15 minutes he should have explained an approach and its complexity before \
             coding; then he codes; in the last ~10 minutes he should test with examples and discuss complexity, and you ask \
             one follow-up. If he starts coding without explaining his approach, ask him to talk you through it first. If \
             he goes quiet or is stuck for a while, offer a small nudge. Don't keep correcting him: let him find his own bugs \
             unless he's stuck."
        )
    } else {
        "You are a coding coach sitting next to him while he practises an interview problem in Java. Teach, don't solve: \
         ask the question that gets him to the next step. If he asks for the answer, give the next hint instead. If he \
         asks how to do something in Java's API (a max-heap, sorting a 2D array, a char count), answer directly in one \
         line: API recall isn't the skill being tested."
            .to_string()
    };
    let run = ctx.last_run.as_ref().map(|r| summarize(p, r)).unwrap_or_else(|| "He hasn't run his code yet.".into());
    // Which hint comes next is decided here, not by the model, so a request for the
    // answer gets exactly one rung of the ladder.
    let next_hint = match p.hints.get(ctx.hints_used as usize) {
        Some(h) => format!("If he asks for the answer or says he's stuck, give ONLY this next hint, in your own words, and nothing beyond it: \"{h}\""),
        None => "He has seen every hint. If he's still stuck, walk him through the approach one step at a time, asking him to do each step.".into(),
    };
    format!(
        "{role}\n\n\
         Rules:\n\
         - Keep replies to at most 4 sentences, one question or point at a time. Spoken style, no headings.\n\
         - Never write the solution or more than one line of code.\n\
         - Whether his code works is decided by the judge below, and only the judge. Never claim tests pass or fail, \
           and never state a complexity, unless the judge facts say so. If he hasn't run it, tell him to run it.\n\
         - When the judge shows a failing input, help him reason about that input. Don't just tell him the fix.\n\
         - Use the interviewer notes to steer. Never read them out or paste them.\n\
         - {next_hint}\n\n\
         ## Problem: {title} ({diff})\n{statement}\n\nExamples:\n{examples}\n\nConstraints: {constraints}\n\n\
         ## Interviewer notes (hidden from the candidate)\nOptimal approach: {explain}\nTarget: O({time}) time, {space} space.\n\
         Hint ladder: {hints}\nFollow-ups to ask after a working solution: {followups}\nHints he has already opened: {used}\n\n\
         ## Judge facts (ground truth)\n{run}\n\n## His current code\n```java\n{code}\n```",
        title = p.title,
        diff = p.difficulty,
        statement = p.statement,
        examples = p.examples.iter().map(|e| format!("- {} → {}", e.input, e.output)).collect::<Vec<_>>().join("\n"),
        constraints = p.constraints.join("; "),
        explain = p.explain,
        time = p.target.time,
        space = p.target.space,
        hints = p.hints.iter().enumerate().map(|(i, h)| format!("({}) {h}", i + 1)).collect::<Vec<_>>().join(" "),
        followups = p.followups.join(" | "),
        used = ctx.hints_used,
        code = numbered(&ctx.code),
        next_hint = next_hint,
    )
}

fn interviewer_model() -> (String, String) {
    let cfg = config::load().ok();
    let model = cfg
        .as_ref()
        .and_then(|c| c.agents.iter().find(|a| a.id == "interview").map(|a| a.model.clone()))
        .unwrap_or_else(|| "qwen3:14b".into());
    (cfg.map(|c| c.ollama_url).unwrap_or_else(|| "http://127.0.0.1:11434".into()), model)
}

#[tauri::command]
pub async fn code_interviewer(
    inflight: State<'_, Inflight>,
    request_id: String,
    problem_id: String,
    messages: Vec<ChatMsg>,
    ctx: InterviewCtx,
    on_event: Channel<ChatEvent>,
) -> Result<()> {
    let p = problem(&problem_id)?;
    let (base, model) = interviewer_model();
    let mut all = vec![ChatMsg { role: "system".into(), content: interviewer_system(p, &ctx) }];
    if messages.is_empty() {
        let open = if ctx.mode == "mock" {
            "(The candidate has joined the call. Greet him in one sentence, give the problem in two sentences, and ask him to restate it and ask any clarifying questions.)"
        } else {
            "(He just opened the problem. In two sentences, ask how he'd start — what's the brute force, and what does it cost?)"
        };
        all.push(ChatMsg { role: "user".into(), content: open.into() });
    }
    all.extend(messages);
    let body = serde_json::json!({
        "model": model, "messages": all, "stream": true, "think": false,
        "options": { "num_ctx": 16384, "temperature": 0.6 },
    });
    let cancel = inflight.register(&request_id);
    let r = agents::stream(&base, body, &on_event, &cancel).await;
    inflight.remove(&request_id);
    r
}

// ---------- mock interview scorecard ----------

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Score {
    pub score: u8,
    pub why: String,
    pub evidence: String,
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Scorecard {
    pub id: String,
    pub problem_id: String,
    pub title: String,
    pub at: String,
    pub elapsed_secs: u64,
    pub correctness: Score,
    pub efficiency: Score,
    pub code_quality: Score,
    pub communication: Score,
    pub problem_solving: Score,
    pub overall: f64,
    pub strengths: Vec<String>,
    pub improve: Vec<String>,
    pub notes: Vec<String>,
    pub transcript: Vec<ChatMsg>,
}

fn norm_text(s: &str) -> String {
    s.to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { ' ' })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// Code facts score correctness, efficiency and quality. The model scores only what
/// is in the transcript, and each score must quote the candidate verbatim.
pub(crate) fn code_scores(r: Option<&RunResult>) -> (Score, Score, Score) {
    let Some(r) = r.filter(|r| r.compiled) else {
        let s = Score { score: 1, why: "No code that compiles was run.".into(), ..Default::default() };
        return (s.clone(), s.clone(), s);
    };
    let ok = r.cases.iter().filter(|c| c.ok).count();
    let total = r.cases.len().max(1);
    let correctness = if r.solved {
        Score { score: 4, why: format!("All {total} tests and {} random stress inputs pass.", r.stress_count), ..Default::default() }
    } else if ok == total && r.stress_ok == Some(false) {
        Score { score: 3, why: "Every fixed test passes, but the stress test found a counterexample.".into(), ..Default::default() }
    } else if ok == total {
        Score { score: 3, why: "Every fixed test passes, but it was never submitted for the full check.".into(), ..Default::default() }
    } else if ok * 2 >= total {
        Score { score: 2, why: format!("{ok}/{total} tests pass."), ..Default::default() }
    } else {
        Score { score: 1, why: format!("{ok}/{total} tests pass."), ..Default::default() }
    };
    let efficiency = match r.complexity.as_ref() {
        Some(c) if c.verdict == "ok" || c.verdict == "fast" => Score { score: 4, why: c.detail.clone(), ..Default::default() },
        Some(c) => Score { score: 2, why: c.detail.clone(), ..Default::default() },
        None => Score { score: 1, why: "Not measured: there was no passing full submit.".into(), ..Default::default() },
    };
    let warns: Vec<&Lint> = r.lint.iter().filter(|l| l.severity == "warn").collect();
    let code_quality = Score {
        score: 4u8.saturating_sub(warns.len().min(3) as u8),
        why: if warns.is_empty() {
            "No Java red flags found.".into()
        } else {
            warns.iter().map(|l| format!("line {}: {}", l.line, l.rule)).collect::<Vec<_>>().join("; ")
        },
        ..Default::default()
    };
    (correctness, efficiency, code_quality)
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct ModelScores {
    communication: Score,
    problem_solving: Score,
    strengths: Vec<String>,
    improve: Vec<String>,
}

#[tauri::command]
pub async fn code_mock_finish(problem_id: String, transcript: Vec<ChatMsg>, last_run: Option<RunResult>, elapsed_secs: u64) -> Result<Scorecard> {
    let p = problem(&problem_id)?;
    let (correctness, efficiency, code_quality) = code_scores(last_run.as_ref());
    let said: Vec<&str> = transcript.iter().filter(|m| m.role == "user").map(|m| m.content.as_str()).collect();
    let words: usize = said.iter().map(|s| s.split_whitespace().count()).sum();
    let mut notes = Vec::new();

    let (base, model) = interviewer_model();
    let convo = transcript
        .iter()
        .map(|m| format!("{}: {}", if m.role == "user" { "CANDIDATE" } else { "INTERVIEWER" }, m.content))
        .collect::<Vec<_>>()
        .join("\n");
    let facts = last_run.as_ref().map(|r| summarize(p, r)).unwrap_or_else(|| "No code was run.".into());
    let prompt = format!(
        "You are scoring a mock coding interview for '{}'. Score ONLY what the transcript shows.\n\n\
         communication (1-4): did he restate the problem, ask clarifying questions, explain the approach and its complexity \
         BEFORE coding, and think out loud?\n\
         problem_solving (1-4): did he reach a working approach himself, use hints well, and consider edge cases?\n\n\
         For each, give \"why\" (one sentence) and \"evidence\": an EXACT quote of at most 20 words copied from a CANDIDATE \
         line. Also give \"strengths\" (2 short items) and \"improve\" (2 short, specific, actionable items).\n\
         Reply with JSON only: {{\"communication\":{{\"score\":n,\"why\":\"\",\"evidence\":\"\"}},\"problem_solving\":{{...}},\"strengths\":[],\"improve\":[]}}\n\n\
         Judge facts: {facts}\n\nTranscript:\n{convo}",
        p.title
    );
    let body = serde_json::json!({
        "model": model, "stream": false, "think": false, "format": "json",
        "messages": [{ "role": "user", "content": prompt }],
        "options": { "num_ctx": 16384, "temperature": 0.2 },
    });
    let mut ms = ModelScores::default();
    match reqwest::Client::new().post(format!("{base}/api/chat")).json(&body).timeout(Duration::from_secs(180)).send().await {
        Ok(resp) => {
            let v: serde_json::Value = resp.json().await.unwrap_or_default();
            ms = serde_json::from_str(v["message"]["content"].as_str().unwrap_or("{}")).unwrap_or_default();
        }
        Err(e) => notes.push(format!("The local model wasn't reachable ({e}); communication and problem solving are unscored.")),
    }
    // Every quote must really be his.
    let heard = norm_text(&said.join(" "));
    for (name, s) in [("communication", &mut ms.communication), ("problem solving", &mut ms.problem_solving)] {
        s.score = s.score.clamp(1, 4);
        let q = norm_text(&s.evidence);
        if !s.evidence.is_empty() && (q.len() < 8 || !heard.contains(&q)) {
            notes.push(format!("The {name} quote wasn't something you actually said, so it was dropped."));
            s.evidence.clear();
        }
    }
    if words < 40 {
        ms.communication = Score {
            score: 1,
            why: format!("You said {words} words in the whole interview. In a real one, silence reads as being stuck — narrate your thinking."),
            evidence: String::new(),
        };
    }
    let overall = [correctness.score, efficiency.score, code_quality.score, ms.communication.score, ms.problem_solving.score]
        .iter()
        .map(|&s| s as f64)
        .sum::<f64>()
        / 5.0;
    let now = chrono::Local::now();
    let card = Scorecard {
        id: format!("{}-{}", now.format("%Y%m%d-%H%M%S"), p.id),
        problem_id: p.id.clone(),
        title: p.title.clone(),
        at: now.to_rfc3339(),
        elapsed_secs,
        correctness,
        efficiency,
        code_quality,
        communication: ms.communication,
        problem_solving: ms.problem_solving,
        overall: (overall * 10.0).round() / 10.0,
        strengths: ms.strengths.into_iter().take(3).collect(),
        improve: ms.improve.into_iter().take(3).collect(),
        notes,
        transcript,
    };
    std::fs::create_dir_all(root().join("mocks"))?;
    std::fs::write(root().join("mocks").join(format!("{}.json", card.id)), serde_json::to_vec_pretty(&card)?)?;
    Ok(card)
}

/// One line for the morning brief and /v1/today.
pub(crate) fn today_line() -> String {
    let o = overview_now();
    let next = o.plan.next.as_deref().and_then(|id| problems().iter().find(|p| p.id == id)).map(|p| p.title.as_str());
    format!(
        "Interview prep: {} due for review{}, {}/{} problems solved, streak {} day{}.",
        o.plan.due.len(),
        next.map(|t| format!(", next new: {t}")).unwrap_or_default(),
        o.solved,
        o.problems.len(),
        o.streak,
        if o.streak == 1 { "" } else { "s" }
    )
}

/// A brute-force two-sum judged for real, so the mock UI shows a slow-but-correct run.
#[cfg(test)]
pub(crate) async fn fixture_run() -> RunResult {
    let brute = "import java.util.*;\n\nclass Solution {\n    public int[] twoSum(int[] nums, int target) {\n        for (int i = 0; i < nums.length; i++)\n            for (int j = i + 1; j < nums.length; j++)\n                if (nums[i] + nums[j] == target) return new int[]{i, j};\n        return new int[0];\n    }\n}\n";
    judge(problem("two-sum").unwrap(), brute, true).await.unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slope_reads_growth() {
        let lin: Vec<(u64, i64)> = (10..18).map(|k| (1u64 << k, (1i64 << k) * 1000)).collect();
        assert!((slope(&lin).unwrap() - 1.0).abs() < 0.01);
        let quad: Vec<(u64, i64)> = (10..16).map(|k| (1u64 << k, ((1i64 << k) * (1i64 << k)) * 2)).collect();
        assert!((slope(&quad).unwrap() - 2.0).abs() < 0.01);
        // sub-half-millisecond points are noise, not evidence
        assert!(slope(&[(1024, 1000), (2048, 2000)]).is_none());
    }

    #[test]
    fn verdict_flags_quadratic_against_linear_target() {
        let b: Vec<BenchPt> = (10..17).map(|k| BenchPt { n: 1 << k, ns: (1i64 << (2 * k)) * 80, ref_ns: (1i64 << k) * 12_000 }).collect();
        let c = complexity(&b, "n");
        assert_eq!(c.verdict, "slow", "{}", c.detail);
        assert!(c.detail.contains("O(n²)"));
        let ok = complexity(&b.iter().map(|p| BenchPt { ns: p.ref_ns, ..p.clone() }).collect::<Vec<_>>(), "n");
        assert_eq!(ok.verdict, "ok");
        let t = complexity(&[BenchPt { n: 1024, ns: 900_000, ref_ns: 10_000 }, BenchPt { n: 2048, ns: -1, ref_ns: -1 }], "n");
        assert_eq!(t.verdict, "timeout");
    }

    #[test]
    fn lint_finds_java_red_flags() {
        let src = r#"
import java.util.*;
class Solution {
    // new Stack<> in a comment is fine
    int f(int[] a, List<Integer> xs, Map<Integer,Integer> m, String s) {
        Stack<Integer> st = new Stack<>();
        int mid = (lo + hi) / 2;
        PriorityQueue<int[]> pq = new PriorityQueue<>((x, y) -> x[0] - y[0]);
        if (s == "abc") return 1;
        if (m.get(1) == m.get(2)) return 2;
        String out = "";
        for (int i = 0; i < 3; i++) out += "x";
        return 0;
    }
}"#;
        let rules: Vec<String> = lint(src).into_iter().map(|l| l.rule).collect();
        for r in ["legacy-stack", "midpoint-overflow", "comparator-subtraction", "string-identity", "boxed-identity", "string-concat-loop"] {
            assert!(rules.contains(&r.to_string()), "missing {r}: {rules:?}");
        }
        let l = lint(src).into_iter().find(|l| l.rule == "legacy-stack").unwrap();
        assert_eq!(l.line, 6, "comment occurrence on line 4 must be ignored");
        assert!(lint("class Solution { int f(int lo, int hi) { return lo + (hi - lo) / 2; } }").is_empty());
    }

    #[test]
    fn compile_errors_point_at_your_line_or_the_signature() {
        let e = compile_errors("/x/Solution.java:3: error: ';' expected\n        return 0\n                ^\n1 error\n", "");
        assert_eq!(e[0].line, 3);
        assert!(e[0].context.contains("return 0"));
        let h = compile_errors(
            "/x/Cases.java:9: error: cannot find symbol\n  symbol: method twoSum(int[],int)\n",
            "class Solution {\n    public int[] twoSum(int[] nums, int target) {\n",
        );
        assert_eq!(h[0].line, 0);
        assert!(h[0].context.contains("twoSum(int[] nums, int target)"));
    }

    #[test]
    fn every_embedded_problem_parses() {
        assert!(problems().len() >= 2);
        for p in problems() {
            assert_eq!(p.hints.len(), 3, "{}", p.id);
            assert!(PATTERN_ORDER.contains(&p.pattern.as_str()), "{}", p.id);
            assert!(p.bench.is_none() || expected_exponent(&p.target.time).is_some(), "{} benchmarks against an unmeasurable target", p.id);
            for f in ["Ref.java", "Cases.java"] {
                assert!(CODE.get_file(format!("problems/{}/{f}", p.id)).is_some(), "{} missing {f}", p.id);
            }
        }
    }

    /// The coach on a real local model, handed a real judge result for a brute force.
    #[tokio::test]
    #[ignore]
    async fn interviewer_live() {
        use std::sync::{atomic::AtomicBool, Arc, Mutex};
        let p = problem("two-sum").unwrap();
        let brute = "class Solution {\n    public int[] twoSum(int[] nums, int target) {\n        for (int i = 0; i < nums.length; i++)\n            for (int j = i + 1; j < nums.length; j++)\n                if (nums[i] + nums[j] == target) return new int[]{i, j};\n        return new int[0];\n    }\n}\n";
        let run = judge(p, brute, true).await.unwrap();
        let ctx = InterviewCtx { code: brute.into(), last_run: Some(run.clone()), elapsed_secs: 600, hints_used: 0, mode: "tutor".into() };
        let (base, model) = interviewer_model();
        for q in ["I think I'm done. Is this good enough for an interview?", "Just give me the optimal code please."] {
            let body = serde_json::json!({
                "model": model, "stream": true, "think": false, "options": { "num_ctx": 16384, "temperature": 0.6 },
                "messages": [{ "role": "system", "content": interviewer_system(p, &ctx) }, { "role": "user", "content": q }],
            });
            let got = Arc::new(Mutex::new(String::new()));
            let sink = got.clone();
            let ch: Channel<ChatEvent> = Channel::new(move |b| {
                if let tauri::ipc::InvokeResponseBody::Json(j) = b
                    && let Ok(v) = serde_json::from_str::<serde_json::Value>(&j)
                    && v["type"] == "token"
                {
                    sink.lock().unwrap().push_str(v["text"].as_str().unwrap_or(""));
                }
                Ok(())
            });
            agents::stream(&base, body, &ch, &AtomicBool::new(false)).await.unwrap();
            let reply = got.lock().unwrap().clone();
            println!("\nQ: {q}\nA: {reply}");
            assert!(!reply.contains("HashMap<Integer, Integer> seen"), "leaked the solution");
        }
        let card = code_mock_finish(
            "two-sum".into(),
            vec![
                ChatMsg { role: "assistant".into(), content: "Hi! Find two indices that sum to target. Want to restate it?".into() },
                ChatMsg { role: "user".into(), content: "So I return two different indices whose values add up to target, and there's always at least one answer. Can values be negative?".into() },
                ChatMsg { role: "assistant".into(), content: "Yes, they can be negative.".into() },
                ChatMsg { role: "user".into(), content: "Brute force is checking every pair, that's O(n squared). I'll start there and then try to speed it up with a hash map.".into() },
            ],
            Some(run),
            1500,
        ).await.unwrap();
        println!("\nscorecard: overall {} | comm {} {:?} \"{}\" | ps {} \"{}\" | notes {:?}", card.overall, card.communication.score, card.communication.why, card.communication.evidence, card.problem_solving.score, card.problem_solving.evidence, card.notes);
        let _ = std::fs::remove_file(root().join("mocks").join(format!("{}.json", card.id)));
        assert_eq!(card.efficiency.score, 2);
    }

    /// Runs the real JDK: the reference passes, a brute force is caught as quadratic,
    /// and a wrong answer gets a counterexample.
    #[tokio::test]
    #[ignore]
    async fn judge_live() {
        let p = problem("two-sum").unwrap();
        let src = CODE.get_file("problems/two-sum/Ref.java").unwrap().contents_utf8().unwrap().replace("class Ref", "class Solution");
        let r = judge(p, &src, true).await.unwrap();
        assert!(r.solved, "reference should solve: {:?}", r.broken);
        assert_eq!(r.complexity.as_ref().unwrap().verdict, "ok", "{}", r.complexity.as_ref().unwrap().detail);

        let brute = "class Solution { public int[] twoSum(int[] a, int t) { for (int i = 0; i < a.length; i++) for (int j = i + 1; j < a.length; j++) if (a[i] + a[j] == t) return new int[]{i, j}; return new int[0]; } }";
        let r = judge(p, brute, true).await.unwrap();
        assert!(r.solved);
        let c = r.complexity.unwrap();
        assert!(c.verdict == "slow" || c.verdict == "timeout", "{}", c.detail);
        println!("brute force: {}", c.detail);

        let wrong = "class Solution { public int[] twoSum(int[] a, int t) { for (int i = 0; i + 1 < a.length; i++) if (a[i] + a[i + 1] == t) return new int[]{i, i + 1}; return new int[0]; } }";
        let r = judge(p, wrong, true).await.unwrap();
        assert!(!r.passed);
        println!("wrong: {}", summarize(p, &r));

        let broken = "class Solution { public int[] twoSum(int[] a, int t) { return null } }";
        let r = judge(p, broken, false).await.unwrap();
        assert!(!r.compiled && r.compile_errors[0].line == 1);
    }
}
