import java.util.*;

public class Main {
    static void subsets(int[] nums, int i, List<Integer> path, List<List<Integer>> out, boolean copy) {
        if (i == nums.length) {
            out.add(copy ? new ArrayList<>(path) : path);
            return;
        }
        subsets(nums, i + 1, path, out, copy);
        path.add(nums[i]);
        subsets(nums, i + 1, path, out, copy);
        path.remove(path.size() - 1);
    }

    public static void main(String[] args) {
        int[] nums = {1, 2};
        List<List<Integer>> bad = new ArrayList<>(), good = new ArrayList<>();
        subsets(nums, 0, new ArrayList<>(), bad, false);
        subsets(nums, 0, new ArrayList<>(), good, true);
        System.out.println(bad);
        System.out.println(good);
    }
}
