import java.util.*;

final class Cases {
    static List<Object[]> fixed() {
        return List.of(
            g("11110", "11010", "11000", "00000"),
            g("11000", "11000", "00100", "00011"),
            g("0"),
            g("1"),
            g("000", "000", "000"),
            g("1111", "1111", "1111"),
            g("101", "010", "101"),
            g("11111", "00001", "11101", "10001", "11111"),
            g("1011101"),
            g("1", "0", "1", "1"),
            g("10001", "00000", "10001")
        );
    }

    static Object[] g(String... rows) {
        char[][] grid = new char[rows.length][];
        for (int i = 0; i < rows.length; i++) grid[i] = rows[i].toCharArray();
        return new Object[]{grid};
    }

    static Object[] random(Random r, int size) {
        int total = Math.max(1, size);
        int rows = 1 + r.nextInt(Math.min(total, 6));
        int cols = Math.max(1, total / rows);
        double land = 0.3 + 0.4 * r.nextDouble();
        char[][] grid = new char[rows][cols];
        for (char[] row : grid) for (int c = 0; c < cols; c++) row[c] = r.nextDouble() < land ? '1' : '0';
        return new Object[]{grid};
    }

    /** A near-square grid of n cells, 60% land: close to the percolation threshold, so islands are big and tangled. */
    static Object[] bench(Random r, int n) {
        int rows = 1 << (Integer.numberOfTrailingZeros(Integer.highestOneBit(n)) / 2);
        int cols = Math.max(1, n / rows);
        char[][] grid = new char[rows][cols];
        for (char[] row : grid) for (int c = 0; c < cols; c++) row[c] = r.nextInt(10) < 6 ? '1' : '0';
        return new Object[]{grid};
    }

    static Object run(Object[] in) { return new Solution().numIslands((char[][]) in[0]); }
    static Object ref(Object[] in) { return new Ref().numIslands((char[][]) in[0]); }

    static boolean accept(Object[] in, Object want, Object got) { return Judge.eq(want, got); }
}
