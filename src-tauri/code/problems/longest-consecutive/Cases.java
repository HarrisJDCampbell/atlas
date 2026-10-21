import java.util.*;

final class Cases {
    static List<Object[]> fixed() {
        return List.of(
            new Object[]{new int[]{100, 4, 200, 1, 3, 2}},
            new Object[]{new int[]{0, 3, 7, 2, 5, 8, 4, 6, 0, 1}},
            new Object[]{new int[]{1, 0, 1, 2}},
            new Object[]{new int[]{}},
            new Object[]{new int[]{42}},
            new Object[]{new int[]{7, 7, 7, 7}},
            new Object[]{new int[]{-3, -1, -2, 5, 4}},
            new Object[]{new int[]{10, 30, 20}},
            new Object[]{new int[]{9, 8, 7, 6, 5, 4, 3, 2, 1}},
            new Object[]{new int[]{Integer.MAX_VALUE, Integer.MIN_VALUE}},
            new Object[]{new int[]{Integer.MIN_VALUE, Integer.MAX_VALUE, Integer.MAX_VALUE - 1, Integer.MIN_VALUE + 1}}
        );
    }

    static Object[] random(Random r, int size) {
        return new Object[]{Judge.ints(r, size, -10, 10)};
    }

    /** One run of n/2 consecutive values plus n/2 scattered ones, shuffled. Walking up from every element (no "is this a start?" check) is quadratic on the long run. */
    static Object[] bench(Random r, int n) {
        int[] a = new int[n];
        int half = n / 2, start = -half / 3;
        for (int i = 0; i < half; i++) a[i] = start + i;
        for (int i = half; i < n; i++) a[i] = 10_000_000 + r.nextInt(1_000_000_000);
        for (int i = n - 1; i > 0; i--) { int k = r.nextInt(i + 1); int t = a[i]; a[i] = a[k]; a[k] = t; }
        return new Object[]{a};
    }

    static Object run(Object[] in) { return new Solution().longestConsecutive((int[]) in[0]); }
    static Object ref(Object[] in) { return new Ref().longestConsecutive((int[]) in[0]); }

    static boolean accept(Object[] in, Object want, Object got) { return Judge.eq(want, got); }
}
