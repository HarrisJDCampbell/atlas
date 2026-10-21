import java.util.*;

final class Cases {
    static List<Object[]> fixed() {
        return List.of(
            iv(new int[][]{{5, 9}, {1, 4}, {3, 6}, {12, 14}}),
            iv(new int[][]{{1, 4}, {4, 5}}),
            iv(new int[][]{{2, 3}, {1, 10}, {4, 5}}),
            iv(new int[][]{{7, 7}}),
            iv(new int[][]{{1, 2}, {3, 4}, {5, 6}}),
            iv(new int[][]{{5, 6}, {3, 4}, {1, 2}}),
            iv(new int[][]{{2, 2}, {2, 2}, {2, 2}}),
            iv(new int[][]{{1, 3}, {2, 4}, {3, 5}, {4, 6}}),
            iv(new int[][]{{0, 0}, {1, 1}, {0, 1}}),
            iv(new int[][]{{1, 5}, {2, 3}, {6, 8}, {0, 1}}),
            iv(new int[][]{{0, 10000}, {10000, 10000}, {5, 5}})
        );
    }

    static Object[] iv(int[][] a) { return new Object[]{(Object) a}; }

    /** Small coordinates so overlaps, touches and duplicates all happen. */
    static Object[] random(Random r, int size) {
        int n = Math.max(1, size);
        int[][] a = new int[n][];
        for (int i = 0; i < n; i++) { int s = r.nextInt(16); a[i] = new int[]{s, s + r.nextInt(4)}; }
        return iv(a);
    }

    /** Shuffled, mostly disjoint short intervals: the output stays ~n/2 long, so merge-until-stable is n^2. */
    static Object[] bench(Random r, int n) {
        int[][] a = new int[n][];
        for (int i = 0; i < n; i++) { int s = r.nextInt(4 * n); a[i] = new int[]{s, s + r.nextInt(3)}; }
        return iv(a);
    }

    static Object run(Object[] in) { return new Solution().merge((int[][]) in[0]); }
    static Object ref(Object[] in) { return new Ref().merge((int[][]) in[0]); }

    static boolean accept(Object[] in, Object want, Object got) { return Judge.eq(want, got); }
}
