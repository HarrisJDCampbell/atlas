import java.util.*;

final class Cases {
    static List<Object[]> fixed() {
        return List.of(
            new Object[]{new int[]{1, 2, 3, 1}},
            new Object[]{new int[]{2, 7, 9, 3, 1}},
            new Object[]{new int[]{5}},
            new Object[]{new int[]{2, 1}},
            new Object[]{new int[]{1, 2}},
            new Object[]{new int[]{0, 0, 0, 0}},
            new Object[]{new int[]{2, 1, 1, 2}},
            new Object[]{new int[]{4, 4, 4, 4, 4}},
            new Object[]{new int[]{9, 8, 7, 6, 5, 4, 3, 2, 1}},
            new Object[]{new int[]{1, 3, 1, 3, 100}},
            new Object[]{new int[]{10000, 1, 1, 10000, 1, 1, 10000}}
        );
    }

    static Object[] random(Random r, int size) {
        return new Object[]{Judge.ints(r, Math.max(1, size), 0, 20)};
    }

    /** Random values: no shortcut exists, every house matters. Values ≤ 400 keep sums in int range. */
    static Object[] bench(Random r, int n) {
        return new Object[]{Judge.ints(r, n, 0, 400)};
    }

    static Object run(Object[] in) { return new Solution().rob((int[]) in[0]); }
    static Object ref(Object[] in) { return new Ref().rob((int[]) in[0]); }

    static boolean accept(Object[] in, Object want, Object got) { return Judge.eq(want, got); }
}
