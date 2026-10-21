import java.util.*;

final class Cases {
    static List<Object[]> fixed() {
        return List.of(
            new Object[]{new int[]{2, 7, 11, 15}, 9},
            new Object[]{new int[]{3, 2, 4}, 6},
            new Object[]{new int[]{3, 3}, 6},
            new Object[]{new int[]{-3, 4, 3, 90}, 0},
            new Object[]{new int[]{0, 4, 3, 0}, 0},
            new Object[]{new int[]{1_000_000_000, 5, -1_000_000_000}, 0},
            new Object[]{new int[]{5, 1, 2, 8, 9, 5}, 10}
        );
    }

    /** Guarantees at least one valid pair; any valid pair is accepted. */
    static Object[] random(Random r, int size) {
        int n = Math.max(2, size);
        int[] a = Judge.ints(r, n, -20, 20);
        int i = r.nextInt(n), j = r.nextInt(n - 1);
        if (j >= i) j++;
        return new Object[]{a, a[i] + a[j]};
    }

    /** One odd value at the end, so the only pair is (n-2, n-1): worst case for a double loop. */
    static Object[] bench(Random r, int n) {
        int[] a = new int[n];
        for (int i = 0; i < n - 1; i++) a[i] = 2 * i;
        a[n - 1] = 1;
        return new Object[]{a, 1 + 2 * (n - 2)};
    }

    static Object run(Object[] in) { return new Solution().twoSum((int[]) in[0], (int) in[1]); }
    static Object ref(Object[] in) { return new Ref().twoSum((int[]) in[0], (int) in[1]); }

    static boolean accept(Object[] in, Object want, Object got) {
        int[] nums = (int[]) in[0], g = (int[]) got;
        int target = (int) in[1];
        return g != null && g.length == 2 && g[0] != g[1] && g[0] >= 0 && g[1] >= 0
            && g[0] < nums.length && g[1] < nums.length && (long) nums[g[0]] + nums[g[1]] == target;
    }
}
