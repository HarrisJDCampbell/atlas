import java.util.*;

final class Cases {
    static List<Object[]> fixed() {
        return List.of(
            iv(new int[][]{{1, 3}, {2, 4}, {3, 5}, {1, 5}}),
            iv(new int[][]{{1, 2}, {2, 3}, {3, 4}}),
            iv(new int[][]{{1, 10}, {2, 3}, {4, 5}, {6, 7}}),
            iv(new int[][]{{0, 1}}),
            iv(new int[][]{{1, 2}, {1, 2}, {1, 2}, {1, 2}}),
            iv(new int[][]{{5, 6}, {3, 4}, {1, 2}}),
            iv(new int[][]{{-50000, 50000}, {-3, -1}, {-1, 0}}),
            iv(new int[][]{{1, 100}, {11, 22}, {1, 11}, {2, 12}}),
            iv(new int[][]{{0, 2}, {1, 3}, {2, 4}, {3, 5}, {4, 6}}),
            iv(new int[][]{{1, 5}, {2, 3}, {3, 4}, {4, 5}})
        );
    }

    static Object[] iv(int[][] a) { return new Object[]{(Object) a}; }

    static Object[] random(Random r, int size) {
        int n = Math.max(1, size);
        int[][] a = new int[n][];
        for (int i = 0; i < n; i++) { int s = -5 + r.nextInt(16); a[i] = new int[]{s, s + 1 + r.nextInt(4)}; }
        return iv(a);
    }

    /** Heavily overlapping shuffled intervals: trying every subset or an O(n^2) DP both crawl. */
    static Object[] bench(Random r, int n) {
        int[][] a = new int[n][];
        for (int i = 0; i < n; i++) { int s = r.nextInt(2 * n); a[i] = new int[]{s, s + 1 + r.nextInt(20)}; }
        return iv(a);
    }

    static Object run(Object[] in) { return new Solution().eraseOverlapIntervals((int[][]) in[0]); }
    static Object ref(Object[] in) { return new Ref().eraseOverlapIntervals((int[][]) in[0]); }

    static boolean accept(Object[] in, Object want, Object got) { return Judge.eq(want, got); }
}
