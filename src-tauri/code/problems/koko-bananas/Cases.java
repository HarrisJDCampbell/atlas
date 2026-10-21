import java.util.*;

final class Cases {
    static List<Object[]> fixed() {
        return List.of(
            new Object[]{new int[]{4, 9, 12}, 6},
            new Object[]{new int[]{10}, 3},
            new Object[]{new int[]{5, 5, 5}, 3},
            new Object[]{new int[]{1}, 1},
            new Object[]{new int[]{1}, 1_000_000_000},
            new Object[]{new int[]{1_000_000_000}, 2},
            new Object[]{new int[]{1_000_000_000, 1_000_000_000}, 1_000_000_000},
            new Object[]{new int[]{3, 6, 2, 8}, 20},
            new Object[]{new int[]{7, 1, 7, 1}, 5}
        );
    }

    /** Small piles; h is at least the number of piles so an answer always exists. */
    static Object[] random(Random r, int size) {
        int n = Math.max(1, size);
        int[] piles = Judge.ints(r, n, 1, 20);
        return new Object[]{piles, n + r.nextInt(2 * n + 10)};
    }

    /**
     * Huge piles and barely more hours than piles, so the answer is in the hundreds of millions:
     * trying speeds 1, 2, 3, ... never finishes. Binary search does ~30 passes over the piles.
     */
    static Object[] bench(Random r, int n) {
        return new Object[]{Judge.ints(r, n, 1, 1_000_000_000), n + n / 3};
    }

    static Object run(Object[] in) { return new Solution().minEatingSpeed((int[]) in[0], (int) in[1]); }
    static Object ref(Object[] in) { return new Ref().minEatingSpeed((int[]) in[0], (int) in[1]); }

    static boolean accept(Object[] in, Object want, Object got) { return Judge.eq(want, got); }
}
