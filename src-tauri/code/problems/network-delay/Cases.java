import java.util.*;

final class Cases {
    static List<Object[]> fixed() {
        return List.of(
            new Object[]{new int[][]{{2, 1, 1}, {2, 3, 1}, {3, 4, 1}}, 4, 2},
            new Object[]{new int[][]{{1, 2, 1}}, 2, 1},
            new Object[]{new int[][]{{1, 2, 1}}, 2, 2},
            new Object[]{new int[][]{}, 1, 1},
            new Object[]{new int[][]{{1, 2, 10}, {1, 3, 1}, {3, 2, 1}}, 3, 1},
            new Object[]{new int[][]{{1, 2, 0}, {2, 3, 0}}, 3, 1},
            new Object[]{new int[][]{{1, 2, 1}, {2, 1, 1}}, 3, 1},
            new Object[]{new int[][]{{1, 2, 5}, {2, 3, 5}, {1, 3, 20}, {3, 1, 1}}, 3, 1},
            new Object[]{new int[][]{{1, 2, 7}, {1, 3, 2}, {1, 4, 9}, {3, 4, 1}}, 4, 1},
            new Object[]{new int[][]{{1, 2, 1}, {2, 3, 1}, {3, 4, 1}, {4, 5, 1}, {1, 5, 100}}, 5, 1},
            new Object[]{new int[][]{{3, 1, 5}, {3, 2, 2}, {2, 1, 2}, {1, 4, 1}}, 4, 3}
        );
    }

    /** Distinct (u, v) pairs with u != v and small weights; reachability is left to chance. */
    static Object[] random(Random r, int size) {
        int n = 1 + r.nextInt(Math.max(1, size / 3 + 1));
        Set<Long> seen = new HashSet<>();
        List<int[]> edges = new ArrayList<>();
        for (int t = 0; t < size && n > 1; t++) {
            int u = 1 + r.nextInt(n), v = 1 + r.nextInt(n);
            if (u != v && seen.add((long) u * (n + 1) + v)) edges.add(new int[]{u, v, r.nextInt(10)});
        }
        return new Object[]{edges.toArray(new int[0][]), n, 1 + r.nextInt(n)};
    }

    /** n edges over n/4 nodes: a heavy chain from k through every node (so all are reachable) plus random cheaper shortcuts. */
    static Object[] bench(Random r, int n) {
        int v = Math.max(2, n / 4);
        int[] order = new int[v];
        for (int i = 0; i < v; i++) order[i] = i + 1;
        for (int i = v - 1; i > 0; i--) { int j = r.nextInt(i + 1), t = order[i]; order[i] = order[j]; order[j] = t; }
        Set<Long> seen = new HashSet<>(2 * n);
        List<int[]> edges = new ArrayList<>(n);
        for (int i = 1; i < v; i++) {
            edges.add(new int[]{order[i - 1], order[i], 100});
            seen.add((long) order[i - 1] * (v + 1) + order[i]);
        }
        while (edges.size() < n) {
            int a = 1 + r.nextInt(v), b = 1 + r.nextInt(v);
            if (a != b && seen.add((long) a * (v + 1) + b)) edges.add(new int[]{a, b, r.nextInt(101)});
        }
        Collections.shuffle(edges, r);
        return new Object[]{edges.toArray(new int[0][]), v, order[0]};
    }

    static Object run(Object[] in) { return new Solution().networkDelayTime((int[][]) in[0], (int) in[1], (int) in[2]); }
    static Object ref(Object[] in) { return new Ref().networkDelayTime((int[][]) in[0], (int) in[1], (int) in[2]); }

    static boolean accept(Object[] in, Object want, Object got) { return Judge.eq(want, got); }
}
