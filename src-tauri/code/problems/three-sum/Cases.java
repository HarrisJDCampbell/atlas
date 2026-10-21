import java.util.*;

final class Cases {
    static List<Object[]> fixed() {
        return List.of(
            new Object[]{new int[]{-1, 0, 1, 2, -1, -4}},
            new Object[]{new int[]{0, 1, 1}},
            new Object[]{new int[]{0, 0, 0}},
            new Object[]{new int[]{0, 0, 0, 0, 0}},
            new Object[]{new int[]{-2, 0, 0, 2, 2}},
            new Object[]{new int[]{1, 2, 3, 4}},
            new Object[]{new int[]{-5, -4, -3}},
            new Object[]{new int[]{-4, -2, -2, -2, 0, 1, 2, 2, 2, 3, 3, 4, 4, 6, 6}},
            new Object[]{new int[]{3, -1, -2, 1, 2, -3, 0}},
            new Object[]{new int[]{-100000, 50000, 50000, 100000, 0}}
        );
    }

    static Object[] random(Random r, int size) {
        return new Object[]{Judge.ints(r, Math.max(3, size), -6, 6)};
    }

    /** Spread-out values, so almost nothing repeats and only a few triplets exist: every pair must be considered. */
    static Object[] bench(Random r, int n) {
        return new Object[]{Judge.ints(r, n, -100_000_000, 100_000_000)};
    }

    static Object run(Object[] in) { return new Solution().threeSum((int[]) in[0]); }
    static Object ref(Object[] in) { return new Ref().threeSum((int[]) in[0]); }

    static boolean accept(Object[] in, Object want, Object got) { return got != null && Judge.sameBagDeep(want, got); }
}
