import java.util.*;

final class Cases {
    static List<Object[]> fixed() {
        return List.of(
            e(new int[][]{{1, 2}, {1, 3}, {3, 4}, {2, 4}, {4, 5}}),
            e(new int[][]{{2, 3}, {1, 2}, {3, 1}}),
            e(new int[][]{{1, 4}, {3, 4}, {1, 3}, {1, 2}, {4, 5}}),
            e(new int[][]{{1, 2}, {2, 3}, {3, 4}, {4, 5}, {5, 1}}),
            e(new int[][]{{3, 1}, {1, 2}, {2, 3}, {3, 4}}),
            e(new int[][]{{1, 2}, {1, 3}, {1, 4}, {1, 5}, {4, 5}}),
            e(new int[][]{{4, 5}, {1, 2}, {2, 3}, {3, 4}, {5, 2}}),
            e(new int[][]{{5, 6}, {1, 6}, {2, 6}, {3, 6}, {4, 6}, {1, 5}}),
            e(new int[][]{{1, 2}, {2, 3}, {3, 4}, {4, 5}, {5, 6}, {6, 7}, {7, 8}, {1, 8}})
        );
    }

    static Object[] e(int[][] edges) { return new Object[]{(Object) edges}; }

    /** A random labelled tree plus one new edge between two non-adjacent nodes, all shuffled. */
    static Object[] random(Random r, int size) {
        int n = Math.max(3, size);
        int[] label = perm(r, n);
        Set<Long> have = new HashSet<>();
        List<int[]> edges = new ArrayList<>();
        for (int i = 2; i <= n; i++) add(edges, have, r, label[i], label[1 + r.nextInt(i - 1)]);
        while (true) {
            int u = 1 + r.nextInt(n), v = 1 + r.nextInt(n);
            if (u != v && !have.contains(key(u, v))) { add(edges, have, r, u, v); break; }
        }
        Collections.shuffle(edges, r);
        return e(edges.toArray(new int[0][]));
    }

    /** One big cycle through all n nodes, shuffled: every edge is on it, and the answer is the last edge. */
    static Object[] bench(Random r, int n) {
        int[] label = perm(r, n);
        int[][] edges = new int[n][];
        for (int i = 1; i <= n; i++) {
            int u = label[i], v = label[i == n ? 1 : i + 1];
            edges[i - 1] = r.nextBoolean() ? new int[]{u, v} : new int[]{v, u};
        }
        for (int i = n - 1; i > 0; i--) { int j = r.nextInt(i + 1); int[] t = edges[i]; edges[i] = edges[j]; edges[j] = t; }
        return e(edges);
    }

    /** label[1..n] is a random permutation of 1..n. */
    static int[] perm(Random r, int n) {
        int[] p = new int[n + 1];
        for (int i = 1; i <= n; i++) p[i] = i;
        for (int i = n; i > 1; i--) { int j = 1 + r.nextInt(i); int t = p[i]; p[i] = p[j]; p[j] = t; }
        return p;
    }

    static long key(int u, int v) { return (long) Math.min(u, v) << 32 | Math.max(u, v); }

    static void add(List<int[]> edges, Set<Long> have, Random r, int u, int v) {
        have.add(key(u, v));
        edges.add(r.nextBoolean() ? new int[]{u, v} : new int[]{v, u});
    }

    static Object run(Object[] in) { return new Solution().findRedundantConnection((int[][]) in[0]); }
    static Object ref(Object[] in) { return new Ref().findRedundantConnection((int[][]) in[0]); }

    static boolean accept(Object[] in, Object want, Object got) { return Judge.eq(want, got); }
}
