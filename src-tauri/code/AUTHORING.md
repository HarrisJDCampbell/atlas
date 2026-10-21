# Authoring CODE problems

CODE judges the user's Java against a reference solution. It never asks a model whether
code is right: correctness, counterexamples and complexity all come from running Java.
That only works if every problem is authored to this spec and passes the validator.

    python3 src-tauri/code/validate.py <problem-id>      # must print "ok"
    python3 src-tauri/code/validate.py --drills

Read `problems/two-sum/` (function problem, custom validity checker) and
`problems/lru-cache/` (class-design problem, op replay) before writing anything. Don't
edit `harness/` or `validate.py`. If you need a harness change, report it instead.

## Layout

    problems/<id>/problem.json   metadata, statement, hints
    problems/<id>/Ref.java       the reference solution
    problems/<id>/Cases.java     inputs, generators, how to call and compare

At run time the user's code is saved as `Solution.java` and compiled together with
`harness/*.java`, `Ref.java` and `Cases.java` in the default package with `javac --release 17`.
`ListNode` and `TreeNode` (`harness/Support.java`) are available, with `ListNode.of(1,2,3)`,
`ListNode.values(head)`, `TreeNode.of(3, 9, 20, null, null, 15, 7)` and `TreeNode.levels(root)`.

## problem.json

| field | rules |
|---|---|
| `id` | kebab-case, same as the folder |
| `title` | the common name people search for, e.g. "Group Anagrams" |
| `pattern` | one of `hashing two-pointers sliding-window stack binary-search linked-list trees heap graphs backtracking dp dp2 intervals design` (`dp` = 1-D, `dp2` = 2-D / string DP, `design` = class design plus trie / union-find) |
| `difficulty` | `easy` / `medium` / `hard`, the way interviewers would rate it |
| `statement` | Markdown, **in your own words**. Don't copy LeetCode or any other site's text, and don't mention problem numbers. Say what to return when there are several valid answers. |
| `examples` | 1–3 `{input, output}` objects. `output` must equal `Judge.show` of the reference's answer on the matching fixed case (whitespace is ignored). Add `"check": false` only when several outputs are valid and yours differs. |
| `constraints` | realistic interview constraints, using `≤` and `10^5` |
| `params` | the parameter names, in order, matching the arrays you return from `fixed()` |
| `classes` | only for design problems: the user-facing class names, e.g. `["LRUCache"]`. Defaults to `["Solution"]`. |
| `starter` | must **compile** and return a default (`return 0;`, `return null;`, `return new int[0];`). Include `import java.util.*;` when the signature needs it. Keep the method names conventional. |
| `target` | `{"time": T, "space": "...", "note": "optional"}`. With a bench, T is one of `1`, `log n`, `n`, `n log n`, `n^2`, `n^3`, **in terms of the bench's n**. With `bench: null`, state the true bound however it reads best (`n·2^n`, `m·n·3^L`). |
| `benchN` | a short phrase for what n is, e.g. "nums.length", "number of cells" |
| `bench` | `{"min": 1024, "max": 1048576}` (powers of two), or `null` for `log n` and exponential problems, where timing tells you nothing |
| `hints` | exactly 3, escalating: (1) a question that points at the key observation, (2) the insight plus the data structure, (3) nearly the algorithm, with no code |
| `followups` | 2–3 questions a real interviewer asks after you solve it |
| `explain` | the optimal approach, why it's correct, time and space, and anything Java-specific (e.g. `ArrayDeque` vs `Stack`, `Integer.compare`, overflow) |
| `tags` | 1–3 technique words |

## Ref.java

* The class is named `Ref`, or `Ref<ClassName>` for design problems (`RefLRUCache`), with
  **the same method signatures** as the starter. The validator turns your reference into a user
  solution by renaming `Ref` → `Solution` and `RefX` → `X`, so write it exactly as a user would.
* Every helper class must be a `private static` nested class **inside** the Ref class.
  A top-level helper would collide with the user's own helpers.
* It must hit `target.time`. The validator measures it and fails if the slope is off by more than 0.45.
* Use `long` wherever an int sum could overflow.

## Cases.java

```java
final class Cases {
    static List<Object[]> fixed()                    // ≥5 inputs: the examples first, then edge cases
    static Object[] random(Random r, int size)       // a small random input; null = no stress test
    static Object[] bench(Random r, int n)           // a large worst-case input of size n; may return null if bench is null
    static Object run(Object[] in)                   // calls the user's Solution (or replays ops on their class)
    static Object ref(Object[] in)                   // the same call on Ref
    static boolean accept(Object[] in, Object want, Object got)
}
```

* **fixed()**: the examples come first, in the same order as `examples`. Then add the edge
  cases interviewers probe: empty or single element, all equal, negatives, duplicates, already
  sorted or reverse sorted, int extremes, the answer at the very start or end. These are where
  people fail, so 6–10 cases is normal.
* **Expected outputs are never hand-written.** The harness computes them by running `Ref`.
  Your job is choosing inputs.
* **random(r, size)**: `size` runs from 0 to 30, smallest first, so counterexamples come out
  short. Every input must satisfy the statement's guarantees: sorted where it says sorted,
  distinct where it says distinct, the answer existing where it says it exists. Handle
  `size == 0` with `Math.max(1, size)` when empty input isn't allowed. Keep value ranges small
  (e.g. −10..10) so duplicates and collisions actually happen.
* **bench(r, n)**: the input that makes a naive approach show its true cost. Examples: the only
  answer sits at the end, every element is distinct, a skewed tree, a dense grid. At
  `bench.max` the reference should take ≥ 20 ms; raise `max` (up to 4194304) or make the
  input heavier if it doesn't. Keep the input itself under ~200 MB.
* **run / ref**: unpack `in` with casts. Design problems take `(String[] ops, int[][] args)`
  and return a `List<Object>`, with `null` for the constructor and for void methods (see lru-cache).
  The harness deep-copies inputs before every call, so mutating them is fine.
* **accept**: normally `Judge.eq(want, got)` (deep, ordered). Use `Judge.sameBag` when order
  doesn't matter, and `Judge.sameBagDeep` when neither the outer nor the inner order matters
  (e.g. subsets or groups). If several answers are valid, **check validity** against the input
  instead of comparing to the reference (see two-sum). `got` may be `null`; never throw on it.

Things the harness can't handle, so avoid them: cyclic `ListNode`s, graph `Node` objects with
neighbour references (clone-graph), random-pointer lists, and anything that reads stdin.

## What makes a problem good here

* It's a problem that actually comes up in SWE intern and new-grad interviews.
* The bench separates the naive solution from the optimal one (n² vs n, or n vs n log n), so the
  user can watch the difference.
* The hints teach the pattern, not just this one problem.
* The `explain` is something the user could say out loud in an interview.

Run the validator **twice** on every problem: benchmark slopes are noisy, and a flaky problem is a broken problem.
