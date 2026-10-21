import java.util.*;

class Ref {
    public List<List<Integer>> combinationSum(int[] candidates, int target) {
        int[] c = candidates.clone();
        Arrays.sort(c); // sorted, so once one candidate overshoots, every later one does too
        List<List<Integer>> out = new ArrayList<>();
        build(c, 0, target, new ArrayList<>(), out);
        return out;
    }

    // Only pick candidates at index >= start: each combination is built in non-decreasing
    // order exactly once. Recursing with i (not i + 1) is what lets a candidate repeat.
    private void build(int[] c, int start, int remaining, List<Integer> cur, List<List<Integer>> out) {
        if (remaining == 0) { out.add(new ArrayList<>(cur)); return; }
        for (int i = start; i < c.length && c[i] <= remaining; i++) {
            cur.add(c[i]);
            build(c, i, remaining - c[i], cur, out);
            cur.remove(cur.size() - 1);
        }
    }
}
