import java.util.*;

final class Cases {
    static List<Object[]> fixed() {
        return List.of(
            new Object[]{new int[]{0, 1, 0, 2, 1, 0, 1, 3, 2, 1, 2, 1}},
            new Object[]{new int[]{4, 2, 0, 3, 2, 5}},
            new Object[]{new int[]{}},
            new Object[]{new int[]{5}},
            new Object[]{new int[]{3, 0}},
            new Object[]{new int[]{1, 2, 3, 4, 5}},
            new Object[]{new int[]{5, 4, 3, 2, 1}},
            new Object[]{new int[]{3, 3, 3, 3}},
            new Object[]{new int[]{5, 0, 0, 0, 5}},
            new Object[]{new int[]{2, 0, 5, 0, 2}},
            new Object[]{new int[]{0, 7, 1, 4, 6}},
            new Object[]{new int[]{100000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 100000}}
        );
    }

    static Object[] random(Random r, int size) {
        return new Object[]{Judge.ints(r, size, 0, 8)};
    }

    /** A noisy mountain (ramp up to the middle, then down), heights ≤ 500 so the answer fits an int at n = 4M. Brute force rescans both sides of every bar: n^2. The noise keeps the two-pointer branch unpredictable, so the timing is honest. */
    static Object[] bench(Random r, int n) {
        int[] a = new int[n];
        int half = Math.max(1, n / 2);
        for (int i = 0; i < n; i++) a[i] = (int) ((long) Math.min(i, n - 1 - i) * 400 / half) + r.nextInt(101);
        return new Object[]{a};
    }

    static Object run(Object[] in) { return new Solution().trap((int[]) in[0]); }
    static Object ref(Object[] in) { return new Ref().trap((int[]) in[0]); }

    static boolean accept(Object[] in, Object want, Object got) { return Judge.eq(want, got); }
}
