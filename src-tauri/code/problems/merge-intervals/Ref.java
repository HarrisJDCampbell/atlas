import java.util.*;

class Ref {
    public int[][] merge(int[][] intervals) {
        Arrays.sort(intervals, (a, b) -> Integer.compare(a[0], b[0]));
        List<int[]> out = new ArrayList<>();
        for (int[] iv : intervals) {
            int[] last = out.isEmpty() ? null : out.get(out.size() - 1);
            if (last == null || last[1] < iv[0]) out.add(new int[]{iv[0], iv[1]});
            else last[1] = Math.max(last[1], iv[1]); // overlaps or touches: extend
        }
        return out.toArray(new int[0][]);
    }
}
