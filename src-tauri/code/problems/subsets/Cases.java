import java.util.*;

final class Cases {
    static List<Object[]> fixed() {
        return List.of(
            new Object[]{new int[]{1, 2, 3}},
            new Object[]{new int[]{0}},
            new Object[]{new int[]{}},
            new Object[]{new int[]{5, -1}},
            new Object[]{new int[]{3, 1, 2, 4}},
            new Object[]{new int[]{-10, 10, 0, 7, -3}},
            new Object[]{new int[]{Integer.MIN_VALUE, Integer.MAX_VALUE}},
            new Object[]{new int[]{9, 8, 7, 6, 5, 4, 3, 2, 1, 0}}
        );
    }

    /** Distinct values; length capped at 10 so the 2^n output stays small. */
    static Object[] random(Random r, int size) {
        int n = Math.min(size, 10);
        List<Integer> pool = new ArrayList<>();
        for (int v = -10; v <= 10; v++) pool.add(v);
        Collections.shuffle(pool, r);
        int[] a = new int[n];
        for (int i = 0; i < n; i++) a[i] = pool.get(i);
        return new Object[]{a};
    }

    static Object[] bench(Random r, int n) { return null; }

    static Object run(Object[] in) { return new Solution().subsets((int[]) in[0]); }
    static Object ref(Object[] in) { return new Ref().subsets((int[]) in[0]); }

    /** Neither the order of subsets nor the order inside a subset matters. */
    static boolean accept(Object[] in, Object want, Object got) { return got != null && Judge.sameBagDeep(want, got); }
}
