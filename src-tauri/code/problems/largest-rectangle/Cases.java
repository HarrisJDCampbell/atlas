import java.util.*;

final class Cases {
    static List<Object[]> fixed() {
        return List.of(
            new Object[]{new int[]{3, 1, 4, 4, 2}},
            new Object[]{new int[]{2, 2, 2}},
            new Object[]{new int[]{1, 3, 2, 5, 4}},
            new Object[]{new int[]{7}},
            new Object[]{new int[]{0}},
            new Object[]{new int[]{0, 0, 0}},
            new Object[]{new int[]{1, 2, 3, 4, 5}},
            new Object[]{new int[]{5, 4, 3, 2, 1}},
            new Object[]{new int[]{4, 0, 4}},
            new Object[]{new int[]{2, 1, 2, 1, 2}},
            new Object[]{new int[]{10000, 10000, 1}}
        );
    }

    static Object[] random(Random r, int size) {
        return new Object[]{Judge.ints(r, Math.max(1, size), 0, 6)};
    }

    /**
     * Nearly flat heights (100..102): every bar of height 100 spans the whole array, so
     * "expand left and right from each bar" and divide-and-conquer on the minimum both go quadratic.
     */
    static Object[] bench(Random r, int n) {
        return new Object[]{Judge.ints(r, n, 100, 102)};
    }

    static Object run(Object[] in) { return new Solution().largestRectangleArea((int[]) in[0]); }
    static Object ref(Object[] in) { return new Ref().largestRectangleArea((int[]) in[0]); }

    static boolean accept(Object[] in, Object want, Object got) { return Judge.eq(want, got); }
}
