import java.util.*;

final class Cases {
    static List<Object[]> fixed() {
        return List.of(
            new Object[]{new int[]{10, 9, 2, 5, 3, 7, 101, 18}},
            new Object[]{new int[]{0, 1, 0, 3, 2, 3}},
            new Object[]{new int[]{7, 7, 7, 7, 7}},
            new Object[]{new int[]{42}},
            new Object[]{new int[]{5, 4, 3, 2, 1}},
            new Object[]{new int[]{1, 2, 3, 4, 5, 6}},
            new Object[]{new int[]{Integer.MIN_VALUE, Integer.MAX_VALUE}},
            new Object[]{new int[]{Integer.MAX_VALUE, Integer.MIN_VALUE}},
            new Object[]{new int[]{4, 10, 4, 3, 8, 9}},
            new Object[]{new int[]{1, 3, 6, 7, 9, 4, 10, 5, 6}},
            new Object[]{new int[]{3, 5, 6, 2, 5, 4, 19, 5, 6, 7, 12}},
            new Object[]{new int[]{-2, -1, -5, 0, -3, 1}}
        );
    }

    static Object[] random(Random r, int size) {
        return new Object[]{Judge.ints(r, Math.max(1, size), -10, 10)};
    }

    /**
     * An upward drift plus noise: the answer is long (about n/4), so the tails array grows
     * large and every binary search really costs log n. The O(n^2) DP does ~n^2/2 comparisons here.
     */
    static Object[] bench(Random r, int n) {
        int[] a = new int[n];
        for (int i = 0; i < n; i++) a[i] = i * 4 + r.nextInt(64);
        return new Object[]{a};
    }

    static Object run(Object[] in) { return new Solution().lengthOfLIS((int[]) in[0]); }
    static Object ref(Object[] in) { return new Ref().lengthOfLIS((int[]) in[0]); }

    static boolean accept(Object[] in, Object want, Object got) { return Judge.eq(want, got); }
}
