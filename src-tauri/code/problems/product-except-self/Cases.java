import java.util.*;

final class Cases {
    static List<Object[]> fixed() {
        return List.of(
            new Object[]{new int[]{1, 2, 3, 4}},
            new Object[]{new int[]{-1, 1, 0, -3, 3}},
            new Object[]{new int[]{2, 3}},
            new Object[]{new int[]{0, 0}},
            new Object[]{new int[]{0, 4, 0, 5}},
            new Object[]{new int[]{5, 0, 2}},
            new Object[]{new int[]{-1, -1, -1, -1}},
            new Object[]{new int[]{1, 1, 1, 1, 1}},
            new Object[]{new int[]{-2, 3, -4, 5, 7}},
            new Object[]{new int[]{30, 30, 30, 30, 30, 30}}
        );
    }

    /** Values in -2..2 and at most 30 of them, so every product fits in an int. */
    static Object[] random(Random r, int size) {
        return new Object[]{Judge.ints(r, Math.max(2, size), -2, 2)};
    }

    /** n values of ±1 (product stays in range); the nested-loop version does n^2 multiplications. */
    static Object[] bench(Random r, int n) {
        int[] a = new int[n];
        for (int i = 0; i < n; i++) a[i] = r.nextBoolean() ? 1 : -1;
        return new Object[]{a};
    }

    static Object run(Object[] in) { return new Solution().productExceptSelf((int[]) in[0]); }
    static Object ref(Object[] in) { return new Ref().productExceptSelf((int[]) in[0]); }

    static boolean accept(Object[] in, Object want, Object got) { return Judge.eq(want, got); }
}
