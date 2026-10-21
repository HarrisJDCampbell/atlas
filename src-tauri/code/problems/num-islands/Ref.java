import java.util.*;

class Ref {
    public int numIslands(char[][] grid) {
        int rows = grid.length, cols = grid[0].length, islands = 0;
        // Explicit stack of cell ids (r * cols + c): a recursive flood fill can go millions deep on a big island.
        int[] stack = new int[rows * cols];
        for (int r = 0; r < rows; r++) {
            for (int c = 0; c < cols; c++) {
                if (grid[r][c] != '1') continue;
                islands++;
                grid[r][c] = '0'; // sink cells when they're pushed, so each is pushed once
                int top = 0;
                stack[top++] = r * cols + c;
                while (top > 0) {
                    int cell = stack[--top], cr = cell / cols, cc = cell % cols;
                    if (cr > 0 && grid[cr - 1][cc] == '1') { grid[cr - 1][cc] = '0'; stack[top++] = cell - cols; }
                    if (cr + 1 < rows && grid[cr + 1][cc] == '1') { grid[cr + 1][cc] = '0'; stack[top++] = cell + cols; }
                    if (cc > 0 && grid[cr][cc - 1] == '1') { grid[cr][cc - 1] = '0'; stack[top++] = cell - 1; }
                    if (cc + 1 < cols && grid[cr][cc + 1] == '1') { grid[cr][cc + 1] = '0'; stack[top++] = cell + 1; }
                }
            }
        }
        return islands;
    }
}
