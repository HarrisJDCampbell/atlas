import java.util.*;

final class Cases {
    static List<Object[]> fixed() {
        return List.of(
            new Object[]{new int[]{15, 18, 22, 3, 7, 9}, 7},
            new Object[]{new int[]{15, 18, 22, 3, 7, 9}, 10},
            new Object[]{new int[]{4}, 4},
            new Object[]{new int[]{4}, 5},
            new Object[]{new int[]{1, 2, 3, 4, 5, 6}, 6},
            new Object[]{new int[]{1, 2, 3, 4, 5, 6}, 1},
            new Object[]{new int[]{6, 1, 2, 3, 4, 5}, 6},
            new Object[]{new int[]{2, 3, 4, 5, 6, 1}, 1},
            new Object[]{new int[]{3, 1}, 1},
            new Object[]{new int[]{3, 1}, 3},
            new Object[]{new int[]{3, 1}, 2},
            new Object[]{new int[]{-2, 0, 7, -10, -5}, -10},
            new Object[]{new int[]{Integer.MAX_VALUE, Integer.MIN_VALUE, 0}, Integer.MIN_VALUE}
        );
    }

    /** Distinct sorted values rotated by a random amount; the target is present about half the time. */
    static Object[] random(Random r, int size) {
        int n = Math.max(1, size);
        int[] sorted = new int[n];
        int v = -10 + r.nextInt(5);
        for (int i = 0; i < n; i++) { sorted[i] = v; v += 1 + r.nextInt(3); }
        int k = r.nextInt(n);
        int[] a = new int[n];
        for (int i = 0; i < n; i++) a[i] = sorted[(i + k) % n];
        int target = r.nextBoolean() ? a[r.nextInt(n)] : sorted[0] - 2 + r.nextInt(sorted[n - 1] - sorted[0] + 5);
        return new Object[]{a, target};
    }

    static Object[] bench(Random r, int n) { return null; }

    static Object run(Object[] in) { return new Solution().search((int[]) in[0], (int) in[1]); }
    static Object ref(Object[] in) { return new Ref().search((int[]) in[0], (int) in[1]); }

    static boolean accept(Object[] in, Object want, Object got) { return Judge.eq(want, got); }
}
