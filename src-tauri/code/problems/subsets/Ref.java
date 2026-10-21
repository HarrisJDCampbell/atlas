import java.util.*;

class Ref {
    public List<List<Integer>> subsets(int[] nums) {
        List<List<Integer>> out = new ArrayList<>();
        build(nums, 0, new ArrayList<>(), out);
        return out;
    }

    // Every node of the recursion tree is a subset: record it, then try extending it
    // with each later element. Starting at `start` is what prevents duplicates like [2,1].
    private void build(int[] nums, int start, List<Integer> cur, List<List<Integer>> out) {
        out.add(new ArrayList<>(cur));
        for (int i = start; i < nums.length; i++) {
            cur.add(nums[i]);
            build(nums, i + 1, cur, out);
            cur.remove(cur.size() - 1);
        }
    }
}
