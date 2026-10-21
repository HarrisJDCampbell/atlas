import java.util.*;

class Ref {
    @SuppressWarnings("unchecked")
    public int[] topKFrequent(int[] nums, int k) {
        Map<Integer, Integer> count = new HashMap<>();
        for (int x : nums) count.merge(x, 1, Integer::sum);
        // A frequency is between 1 and nums.length, so bucket values by frequency instead of sorting.
        List<Integer>[] buckets = new List[nums.length + 1];
        for (Map.Entry<Integer, Integer> e : count.entrySet()) {
            int f = e.getValue();
            if (buckets[f] == null) buckets[f] = new ArrayList<>();
            buckets[f].add(e.getKey());
        }
        int[] out = new int[k];
        int i = 0;
        for (int f = nums.length; f > 0 && i < k; f--) {
            if (buckets[f] == null) continue;
            for (int x : buckets[f]) {
                if (i == k) break;
                out[i++] = x;
            }
        }
        return out;
    }
}
