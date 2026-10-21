import java.util.*;

final class Cases {
    static final int MIN = Integer.MIN_VALUE, MAX = Integer.MAX_VALUE;

    static List<Object[]> fixed() {
        return List.of(
            new Object[]{new int[]{1, 1, 1, 2, 2, 3}, 2},
            new Object[]{new int[]{1}, 1},
            new Object[]{new int[]{4, 1, -1, 2, -1, 2, 3, -1}, 2},
            new Object[]{new int[]{5, 5, 5, 5}, 1},
            new Object[]{new int[]{1, 2, 3, 4}, 4},
            new Object[]{new int[]{-1, -1, -2, -2, -2, -3}, 2},
            new Object[]{new int[]{MAX, MAX, MIN, MIN, MIN, 0}, 2},
            new Object[]{new int[]{3, 0, 1, 0}, 1},
            new Object[]{new int[]{6, 6, 6, 7, 7, 8, 8, 8, 8, 9}, 3},
            new Object[]{new int[]{2, 2, 1, 1, 1, 3, 3, 3, 3}, 3}
        );
    }

    /** Distinct values with random counts; k is only chosen where the kth and (k+1)th counts differ, so the answer is unique. */
    static Object[] random(Random r, int size) {
        int m = 1 + r.nextInt(Math.min(21, Math.max(1, size / 2 + 1)));
        int maxF = Math.max(1, Math.min(5, size / 3 + 1));
        List<Integer> pool = new ArrayList<>();
        for (int v = -10; v <= 10; v++) pool.add(v);
        Collections.shuffle(pool, r);
        int[] f = new int[m];
        for (int i = 0; i < m; i++) f[i] = 1 + r.nextInt(maxF);
        Integer[] order = new Integer[m];
        for (int i = 0; i < m; i++) order[i] = i;
        Arrays.sort(order, (a, b) -> Integer.compare(f[b], f[a]));
        List<Integer> ks = new ArrayList<>();
        for (int k = 1; k <= m; k++) if (k == m || f[order[k - 1]] > f[order[k]]) ks.add(k);
        List<Integer> nums = new ArrayList<>();
        for (int i = 0; i < m; i++) for (int c = 0; c < f[i]; c++) nums.add(pool.get(i));
        Collections.shuffle(nums, r);
        return new Object[]{nums.stream().mapToInt(Integer::intValue).toArray(), ks.get(r.nextInt(ks.size()))};
    }

    /**
     * k = n/64 heavy values seen 20-28 times each, then light values seen 1-12 times each until n is reached:
     * about 0.11n distinct values, a unique answer, and an O(k * distinct) "pick the max k times" loop is quadratic.
     */
    static Object[] bench(Random r, int n) {
        int k = Math.max(1, n / 64);
        int[] a = new int[n];
        int len = 0;
        for (int t = 0; t < k && len < n; t++) {
            int f = 20 + r.nextInt(9);
            for (int c = 0; c < f && len < n; c++) a[len++] = mix(2 * t);
        }
        for (int s = 0; len < n; s++) {
            int f = 1 + r.nextInt(12);
            for (int c = 0; c < f && len < n; c++) a[len++] = mix(2 * s + 1);
        }
        for (int i = n - 1; i > 0; i--) { int j = r.nextInt(i + 1), t = a[i]; a[i] = a[j]; a[j] = t; }
        return new Object[]{a, k};
    }

    /** Multiplying by an odd constant is a bijection on int, so distinct inputs stay distinct but look random. */
    static int mix(int x) { return (int) (x * 0x9E3779B1L); }

    static Object run(Object[] in) { return new Solution().topKFrequent((int[]) in[0], (int) in[1]); }
    static Object ref(Object[] in) { return new Ref().topKFrequent((int[]) in[0], (int) in[1]); }

    static boolean accept(Object[] in, Object want, Object got) { return got != null && Judge.sameBag(want, got); }
}
