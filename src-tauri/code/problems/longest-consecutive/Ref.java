import java.util.*;

class Ref {
    public int longestConsecutive(int[] nums) {
        Set<Integer> set = new HashSet<>(nums.length * 2);
        for (int x : nums) set.add(x);
        int best = 0;
        for (int x : set) {
            // Only start counting at the bottom of a run. x - 1 would wrap at MIN_VALUE.
            if (x != Integer.MIN_VALUE && set.contains(x - 1)) continue;
            int len = 1;
            for (int y = x; y != Integer.MAX_VALUE && set.contains(y + 1); y++) len++;
            best = Math.max(best, len);
        }
        return best;
    }
}
