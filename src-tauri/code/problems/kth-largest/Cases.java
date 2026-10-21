import java.util.*;

final class Cases {
    static final int MIN = Integer.MIN_VALUE, MAX = Integer.MAX_VALUE;

    static List<Object[]> fixed() {
        return List.of(
            new Object[]{new int[]{3, 2, 1, 5, 6, 4}, 2},
            new Object[]{new int[]{3, 2, 3, 1, 2, 4, 5, 5, 6}, 4},
            new Object[]{new int[]{1}, 1},
            new Object[]{new int[]{2, 2, 2, 2}, 3},
            new Object[]{new int[]{-1, -5, -3}, 3},
            new Object[]{new int[]{MAX, MIN, 0}, 1},
            new Object[]{new int[]{MAX, MIN, 0}, 3},
            new Object[]{new int[]{1, 2, 3, 4, 5, 6, 7, 8}, 8},
            new Object[]{new int[]{9, 8, 7, 6, 5}, 1},
            new Object[]{new int[]{7, 7, 1, 7}, 3}
        );
    }

    static Object[] random(Random r, int size) {
        int n = Math.max(1, size);
        return new Object[]{Judge.ints(r, n, -10, 10), 1 + r.nextInt(n)};
    }

    /** n random values, k = n/2: the heap stays big, and an O(n·k) selection is quadratic. */
    static Object[] bench(Random r, int n) {
        int[] a = new int[n];
        for (int i = 0; i < n; i++) a[i] = r.nextInt();
        return new Object[]{a, Math.max(1, n / 2)};
    }

    static Object run(Object[] in) { return new Solution().findKthLargest((int[]) in[0], (int) in[1]); }
    static Object ref(Object[] in) { return new Ref().findKthLargest((int[]) in[0], (int) in[1]); }

    static boolean accept(Object[] in, Object want, Object got) { return Judge.eq(want, got); }
}
