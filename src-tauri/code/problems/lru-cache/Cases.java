import java.util.*;

final class Cases {
    static List<Object[]> fixed() {
        return List.of(
            ops(new String[]{"LRUCache", "put", "put", "get", "put", "get", "put", "get", "get", "get"},
                new int[][]{{2}, {1, 1}, {2, 2}, {1}, {3, 3}, {2}, {4, 4}, {1}, {3}, {4}}),
            ops(new String[]{"LRUCache", "put", "get", "put", "get", "get"},
                new int[][]{{1}, {2, 1}, {2}, {3, 2}, {2}, {3}}),
            ops(new String[]{"LRUCache", "put", "put", "put", "get", "get"},
                new int[][]{{2}, {1, 1}, {1, 5}, {2, 2}, {1}, {2}}),
            ops(new String[]{"LRUCache", "get", "put", "get", "put", "put", "get", "get"},
                new int[][]{{2}, {2}, {2, 6}, {1}, {1, 5}, {1, 2}, {1}, {2}}),
            ops(new String[]{"LRUCache", "put", "put", "get", "put", "get", "get"},
                new int[][]{{2}, {2, 1}, {1, 1}, {2}, {4, 1}, {1}, {2}})
        );
    }

    static Object[] ops(String[] names, int[][] args) { return new Object[]{names, args}; }

    static Object[] random(Random r, int size) {
        int n = size + 1;
        String[] names = new String[n];
        int[][] args = new int[n][];
        names[0] = "LRUCache";
        args[0] = new int[]{1 + r.nextInt(3)};
        for (int i = 1; i < n; i++) {
            if (r.nextBoolean()) { names[i] = "put"; args[i] = new int[]{r.nextInt(5), r.nextInt(100)}; }
            else { names[i] = "get"; args[i] = new int[]{r.nextInt(5)}; }
        }
        return ops(names, args);
    }

    /** n operations over n/2 capacity: every put after warm-up evicts. */
    static Object[] bench(Random r, int n) {
        String[] names = new String[n + 1];
        int[][] args = new int[n + 1][];
        names[0] = "LRUCache";
        args[0] = new int[]{Math.max(1, n / 2)};
        for (int i = 1; i <= n; i++) {
            if (i % 3 == 0) { names[i] = "get"; args[i] = new int[]{r.nextInt(n)}; }
            else { names[i] = "put"; args[i] = new int[]{r.nextInt(n), i}; }
        }
        return ops(names, args);
    }

    static Object run(Object[] in) {
        String[] names = (String[]) in[0];
        int[][] args = (int[][]) in[1];
        List<Integer> out = new ArrayList<>();
        LRUCache c = null;
        for (int i = 0; i < names.length; i++) {
            switch (names[i]) {
                case "LRUCache" -> { c = new LRUCache(args[i][0]); out.add(null); }
                case "get" -> out.add(c.get(args[i][0]));
                default -> { c.put(args[i][0], args[i][1]); out.add(null); }
            }
        }
        return out;
    }

    static Object ref(Object[] in) {
        String[] names = (String[]) in[0];
        int[][] args = (int[][]) in[1];
        List<Integer> out = new ArrayList<>();
        RefLRUCache c = null;
        for (int i = 0; i < names.length; i++) {
            switch (names[i]) {
                case "LRUCache" -> { c = new RefLRUCache(args[i][0]); out.add(null); }
                case "get" -> out.add(c.get(args[i][0]));
                default -> { c.put(args[i][0], args[i][1]); out.add(null); }
            }
        }
        return out;
    }

    static boolean accept(Object[] in, Object want, Object got) { return Judge.eq(want, got); }
}
