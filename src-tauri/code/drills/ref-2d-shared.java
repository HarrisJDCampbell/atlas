import java.util.*;

public class Main {
    public static void main(String[] args) {
        int[][] grid = new int[3][];
        Arrays.fill(grid, new int[3]);
        grid[0][0] = 7;
        System.out.println(grid[1][0] + " " + grid[2][0]);
        int[][] ok = new int[3][3];
        ok[0][0] = 7;
        System.out.println(ok[1][0]);
        int[][] g = {{1, 2}, {3, 4}};
        int[][] copy = g.clone();
        copy[0][0] = 99;
        System.out.println(g[0][0]);
        List<List<Integer>> rows = Collections.nCopies(2, new ArrayList<>());
        rows.get(0).add(1);
        System.out.println(rows);
    }
}
