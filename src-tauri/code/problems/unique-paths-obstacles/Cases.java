import java.util.*;

final class Cases {
    static List<Object[]> fixed() {
        return List.of(
            new Object[]{(Object) new int[][]{{0, 0, 0, 0}, {0, 1, 0, 0}, {0, 0, 0, 0}}},
            new Object[]{(Object) new int[][]{{0, 1}, {1, 0}}},
            new Object[]{(Object) new int[][]{{0, 0}, {0, 0}}},
            new Object[]{(Object) new int[][]{{0}}},
            new Object[]{(Object) new int[][]{{1}}},
            new Object[]{(Object) new int[][]{{1, 0, 0}, {0, 0, 0}}},
            new Object[]{(Object) new int[][]{{0, 0, 0}, {0, 0, 1}}},
            new Object[]{(Object) new int[][]{{0, 0, 1, 0, 0}}},
            new Object[]{(Object) new int[][]{{0, 0, 0, 0, 0}}},
            new Object[]{(Object) new int[][]{{0}, {0}, {0}, {1}, {0}}},
            new Object[]{(Object) new int[][]{{0, 0, 0}, {1, 1, 0}, {0, 0, 0}}},
            new Object[]{(Object) new int[][]{{0, 0, 0, 0, 0, 0}, {0, 0, 0, 0, 0, 0}, {0, 0, 0, 0, 0, 0}, {0, 0, 0, 0, 0, 0}, {0, 0, 0, 0, 0, 0}, {0, 0, 0, 0, 0, 0}}}
        );
    }

    /** Up to ~30 cells, about a quarter blocked (including, sometimes, the corners). */
    static Object[] random(Random r, int size) {
        int cells = Math.max(1, size);
        int rows = 1 + r.nextInt(Math.min(6, cells));
        int cols = Math.max(1, cells / rows);
        int[][] g = new int[rows][cols];
        for (int[] row : g) for (int j = 0; j < cols; j++) row[j] = r.nextInt(4) == 0 ? 1 : 0;
        return new Object[]{(Object) g};
    }

    /**
     * A 2 x n/2 corridor, so the path count (at most n/2) fits in an int at any size.
     * Plain recursion re-walks the bottom row from every column: n^2. The table is linear.
     */
    static Object[] bench(Random r, int n) {
        int cols = Math.max(2, n / 2);
        int[][] g = new int[2][cols];
        for (int k = 0; k < 8; k++) g[1][1 + r.nextInt(Math.max(1, cols / 16))] = 1;
        return new Object[]{(Object) g};
    }

    static Object run(Object[] in) { return new Solution().uniquePathsWithObstacles((int[][]) in[0]); }
    static Object ref(Object[] in) { return new Ref().uniquePathsWithObstacles((int[][]) in[0]); }

    static boolean accept(Object[] in, Object want, Object got) { return Judge.eq(want, got); }
}
