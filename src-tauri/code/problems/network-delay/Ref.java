import java.util.*;

class Ref {
    public int networkDelayTime(int[][] times, int n, int k) {
        List<List<int[]>> out = new ArrayList<>(n + 1);
        for (int i = 0; i <= n; i++) out.add(new ArrayList<>());
        for (int[] t : times) out.get(t[0]).add(new int[]{t[1], t[2]});

        int[] dist = new int[n + 1];
        Arrays.fill(dist, Integer.MAX_VALUE);
        dist[k] = 0;
        // Dijkstra with lazy deletion: stale queue entries are skipped when popped.
        PriorityQueue<int[]> pq = new PriorityQueue<>((a, b) -> Integer.compare(a[1], b[1]));
        pq.add(new int[]{k, 0});
        while (!pq.isEmpty()) {
            int[] top = pq.poll();
            int u = top[0], d = top[1];
            if (d > dist[u]) continue;
            for (int[] e : out.get(u)) {
                int nd = d + e[1];
                if (nd < dist[e[0]]) {
                    dist[e[0]] = nd;
                    pq.add(new int[]{e[0], nd});
                }
            }
        }
        int worst = 0;
        for (int v = 1; v <= n; v++) {
            if (dist[v] == Integer.MAX_VALUE) return -1;
            worst = Math.max(worst, dist[v]);
        }
        return worst;
    }
}
