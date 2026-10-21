class Ref {
    public int[] findRedundantConnection(int[][] edges) {
        int n = edges.length; // a tree on n nodes has n-1 edges, plus the extra one
        int[] parent = new int[n + 1], rank = new int[n + 1];
        for (int i = 0; i <= n; i++) parent[i] = i;
        for (int[] e : edges) {
            int a = find(parent, e[0]), b = find(parent, e[1]);
            if (a == b) return e; // already connected: this edge closes the cycle
            if (rank[a] < rank[b]) { int t = a; a = b; b = t; }
            parent[b] = a;        // hang the shorter tree under the taller one
            if (rank[a] == rank[b]) rank[a]++;
        }
        return new int[0];
    }

    /** Root of x's set, pointing every node on the way straight at it (iterative: no deep recursion). */
    private static int find(int[] parent, int x) {
        int root = x;
        while (parent[root] != root) root = parent[root];
        while (parent[x] != root) { int next = parent[x]; parent[x] = root; x = next; }
        return root;
    }
}
