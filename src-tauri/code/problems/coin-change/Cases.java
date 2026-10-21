import java.util.*;

final class Cases {
    static List<Object[]> fixed() {
        return List.of(
            new Object[]{new int[]{1, 2, 5}, 11},
            new Object[]{new int[]{2}, 3},
            new Object[]{new int[]{1}, 0},
            new Object[]{new int[]{186, 419, 83, 408}, 6249},
            new Object[]{new int[]{1, 3, 4}, 6},
            new Object[]{new int[]{5, 3}, 7},
            new Object[]{new int[]{2, 5, 10, 1}, 27},
            new Object[]{new int[]{Integer.MAX_VALUE}, 2},
            new Object[]{new int[]{1, Integer.MAX_VALUE}, 3},
            new Object[]{new int[]{7}, 7},
            new Object[]{new int[]{3, 7, 11}, 10000}
        );
    }

    /** 1–4 distinct coins in 1..12, small amounts, so impossible amounts show up too. */
    static Object[] random(Random r, int size) {
        int k = 1 + r.nextInt(4);
        List<Integer> pool = new ArrayList<>();
        for (int v = 1; v <= 12; v++) pool.add(v);
        Collections.shuffle(pool, r);
        int[] coins = new int[k];
        for (int i = 0; i < k; i++) coins[i] = pool.get(i);
        return new Object[]{coins, r.nextInt(3 * size + 1)};
    }

    /** n is the amount; the coin set is fixed, so the reference's work is n × 8. Greedy fails on it. */
    static Object[] bench(Random r, int n) {
        return new Object[]{new int[]{186, 419, 83, 408, 97, 251, 333, 59}, n};
    }

    static Object run(Object[] in) { return new Solution().coinChange((int[]) in[0], (int) in[1]); }
    static Object ref(Object[] in) { return new Ref().coinChange((int[]) in[0], (int) in[1]); }

    static boolean accept(Object[] in, Object want, Object got) { return Judge.eq(want, got); }
}
