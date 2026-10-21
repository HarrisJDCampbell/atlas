import java.util.*;

final class Cases {
    static char[][] grid(String... rows) {
        char[][] g = new char[rows.length][];
        for (int i = 0; i < rows.length; i++) g[i] = rows[i].toCharArray();
        return g;
    }

    static List<Object[]> fixed() {
        char[][] demo = grid("CATS", "ORED", "DOGX");
        return List.of(
            new Object[]{demo, "CARED"},
            new Object[]{demo, "DOGE"},
            new Object[]{demo, "RAR"},
            new Object[]{grid("A"), "A"},
            new Object[]{grid("A"), "B"},
            new Object[]{grid("AB"), "ABA"},
            new Object[]{grid("AB", "CD"), "ABDC"},
            new Object[]{grid("AB", "CD"), "ABCD"},
            new Object[]{grid("ab", "cd"), "Ab"},
            new Object[]{grid("AAAA", "AAAA", "AAAA", "AAAA"), "AAAAAAAAAAAAAAAB"},
            new Object[]{grid("AAA", "ABA", "AAA"), "AAAAAAAAB"},
            new Object[]{grid("ABC", "DEF"), "ABCDEFG"},
            new Object[]{grid("XYZ", "QRS", "MNO"), "O"}
        );
    }

    /** Small grids over "ABC". Half the words trace a real path, so "true" answers are common. */
    static Object[] random(Random r, int size) {
        int rows = 1 + r.nextInt(Math.min(4, 1 + size / 3)), cols = 1 + r.nextInt(Math.min(4, 1 + size / 3));
        char[][] g = new char[rows][cols];
        for (char[] row : g) for (int c = 0; c < cols; c++) row[c] = "ABC".charAt(r.nextInt(3));
        int len = 1 + r.nextInt(Math.min(rows * cols + 1, size + 1));
        StringBuilder w = new StringBuilder();
        if (r.nextBoolean()) {
            boolean[][] used = new boolean[rows][cols];
            int y = r.nextInt(rows), x = r.nextInt(cols);
            int[][] dirs = {{1, 0}, {-1, 0}, {0, 1}, {0, -1}};
            while (w.length() < len) {
                used[y][x] = true;
                w.append(g[y][x]);
                List<int[]> next = new ArrayList<>();
                for (int[] d : dirs) {
                    int ny = y + d[0], nx = x + d[1];
                    if (ny >= 0 && nx >= 0 && ny < rows && nx < cols && !used[ny][nx]) next.add(new int[]{ny, nx});
                }
                if (next.isEmpty()) break;
                int[] p = next.get(r.nextInt(next.size()));
                y = p[0]; x = p[1];
            }
        } else {
            w.append(Judge.str(r, Math.min(len, 8), "ABC"));
        }
        return new Object[]{g, w.toString()};
    }

    static Object[] bench(Random r, int n) { return null; }

    static Object run(Object[] in) { return new Solution().exist((char[][]) in[0], (String) in[1]); }
    static Object ref(Object[] in) { return new Ref().exist((char[][]) in[0], (String) in[1]); }

    static boolean accept(Object[] in, Object want, Object got) { return Judge.eq(want, got); }
}
