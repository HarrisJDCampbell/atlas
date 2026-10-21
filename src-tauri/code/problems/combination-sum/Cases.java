import java.util.*;

final class Cases {
    static List<Object[]> fixed() {
        return List.of(
            new Object[]{new int[]{2, 3, 6, 7}, 7},
            new Object[]{new int[]{2, 3, 5}, 8},
            new Object[]{new int[]{2}, 1},
            new Object[]{new int[]{1}, 1},
            new Object[]{new int[]{1}, 3},
            new Object[]{new int[]{7, 3, 2}, 18},
            new Object[]{new int[]{5, 10}, 3},
            new Object[]{new int[]{40}, 40},
            new Object[]{new int[]{8, 7, 4, 3}, 11},
            new Object[]{new int[]{2, 4, 6, 8}, 13}
        );
    }

    /** Distinct candidates in 2..15 and a target ≤ 24, so the answer list stays small. */
    static Object[] random(Random r, int size) {
        int k = 1 + Math.min(size, 6);
        List<Integer> pool = new ArrayList<>();
        for (int v = 2; v <= 15; v++) pool.add(v);
        Collections.shuffle(pool, r);
        int[] c = new int[k];
        for (int i = 0; i < k; i++) c[i] = pool.get(i);
        int target = 1 + r.nextInt(Math.min(24, 4 + size));
        return new Object[]{c, target};
    }

    static Object[] bench(Random r, int n) { return null; }

    static Object run(Object[] in) { return new Solution().combinationSum((int[]) in[0], (int) in[1]); }
    static Object ref(Object[] in) { return new Ref().combinationSum((int[]) in[0], (int) in[1]); }

    /** Combinations in any order, numbers inside a combination in any order. */
    static boolean accept(Object[] in, Object want, Object got) { return got != null && Judge.sameBagDeep(want, got); }
}
