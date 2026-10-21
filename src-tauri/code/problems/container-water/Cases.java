import java.util.*;

final class Cases {
    static List<Object[]> fixed() {
        return List.of(
            new Object[]{new int[]{1, 8, 6, 2, 5, 4, 8, 3, 7}},
            new Object[]{new int[]{1, 1}},
            new Object[]{new int[]{0, 0}},
            new Object[]{new int[]{4, 3, 2, 1, 4}},
            new Object[]{new int[]{1, 2, 4, 3}},
            new Object[]{new int[]{1, 2, 3, 4, 5, 6, 7, 8, 9, 10}},
            new Object[]{new int[]{10, 9, 8, 7, 6, 5, 4, 3, 2, 1}},
            new Object[]{new int[]{2, 3, 10, 5, 7, 8, 9}},
            new Object[]{new int[]{0, 10000, 10000, 0}},
            new Object[]{new int[]{1, 10000, 1, 1, 1, 1, 10000, 1}}
        );
    }

    static Object[] random(Random r, int size) {
        return new Object[]{Judge.ints(r, Math.max(2, size), 0, 10)};
    }

    /** A noisy mountain (ramp up to the middle, then down), heights ≤ 500 so the answer fits an int at n = 4M. Brute force tries all n^2/2 pairs. The noise keeps the two-pointer branch unpredictable, so the timing is honest. */
    static Object[] bench(Random r, int n) {
        int[] a = new int[n];
        int half = Math.max(1, n / 2);
        for (int i = 0; i < n; i++) a[i] = (int) ((long) Math.min(i, n - 1 - i) * 400 / half) + r.nextInt(101);
        return new Object[]{a};
    }

    static Object run(Object[] in) { return new Solution().maxArea((int[]) in[0]); }
    static Object ref(Object[] in) { return new Ref().maxArea((int[]) in[0]); }

    static boolean accept(Object[] in, Object want, Object got) { return Judge.eq(want, got); }
}
