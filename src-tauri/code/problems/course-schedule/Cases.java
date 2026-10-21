import java.util.*;

final class Cases {
    static List<Object[]> fixed() {
        return List.of(
            new Object[]{2, new int[][]{{1, 0}}},
            new Object[]{2, new int[][]{{1, 0}, {0, 1}}},
            new Object[]{1, new int[][]{}},
            new Object[]{3, new int[][]{}},
            new Object[]{4, new int[][]{{1, 0}, {2, 1}, {3, 2}}},
            new Object[]{4, new int[][]{{1, 0}, {2, 1}, {3, 2}, {0, 3}}},
            new Object[]{5, new int[][]{{1, 0}, {3, 4}, {4, 2}, {2, 3}}},
            new Object[]{4, new int[][]{{1, 0}, {2, 0}, {3, 1}, {3, 2}}},
            new Object[]{3, new int[][]{{0, 1}, {0, 2}, {1, 2}}},
            new Object[]{6, new int[][]{{1, 0}, {2, 1}, {0, 2}, {4, 3}, {5, 4}}},
            new Object[]{3, new int[][]{{0, 2}, {1, 2}}}
        );
    }

    /** Distinct pairs with a != b; half the time they follow a hidden order (always finishable), half the time anything goes. */
    static Object[] random(Random r, int size) {
        int n = 1 + r.nextInt(Math.max(1, size / 2 + 1));
        boolean dag = r.nextBoolean();
        int[] rank = new int[n];
        List<Integer> perm = new ArrayList<>();
        for (int i = 0; i < n; i++) perm.add(i);
        Collections.shuffle(perm, r);
        for (int i = 0; i < n; i++) rank[perm.get(i)] = i;
        Set<Long> seen = new HashSet<>();
        List<int[]> pairs = new ArrayList<>();
        for (int t = 0; t < size && n > 1; t++) {
            int a = r.nextInt(n), b = r.nextInt(n);
            if (a == b) continue;
            if (dag && rank[a] < rank[b]) { int x = a; a = b; b = x; }
            if (seen.add((long) a * n + b)) pairs.add(new int[]{a, b});
        }
        return new Object[]{n, pairs.toArray(new int[0][])};
    }

    /**
     * Course i needs i + 1 and one course a few steps further on, so the only order is n-1, n-2, ..., 0.
     * Finishable, so every course is processed. A "scan for any ready course" loop needs n passes (n^2),
     * and a DFS without a "done" state re-explores shared suffixes exponentially.
     */
    static Object[] bench(Random r, int n) {
        List<int[]> pairs = new ArrayList<>(2 * n);
        for (int i = 0; i + 1 < n; i++) {
            pairs.add(new int[]{i, i + 1});
            int room = n - 1 - (i + 2);
            if (room >= 0) pairs.add(new int[]{i, i + 2 + r.nextInt(Math.min(8, room + 1))});
        }
        return new Object[]{n, pairs.toArray(new int[0][])};
    }

    static Object run(Object[] in) { return new Solution().canFinish((int) in[0], (int[][]) in[1]); }
    static Object ref(Object[] in) { return new Ref().canFinish((int) in[0], (int[][]) in[1]); }

    static boolean accept(Object[] in, Object want, Object got) { return Judge.eq(want, got); }
}
