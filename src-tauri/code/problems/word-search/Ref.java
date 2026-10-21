import java.util.*;

class Ref {
    public boolean exist(char[][] board, String word) {
        for (int r = 0; r < board.length; r++)
            for (int c = 0; c < board[0].length; c++)
                if (dfs(board, word, 0, r, c)) return true;
        return false;
    }

    // Can word[k..] be spelled starting at (r, c)? The cell is marked '#' while it is on the
    // current path, so the path can't revisit it, and restored on the way back out.
    private boolean dfs(char[][] b, String w, int k, int r, int c) {
        if (r < 0 || c < 0 || r >= b.length || c >= b[0].length || b[r][c] != w.charAt(k)) return false;
        if (k == w.length() - 1) return true;
        char saved = b[r][c];
        b[r][c] = '#';
        boolean found = dfs(b, w, k + 1, r + 1, c) || dfs(b, w, k + 1, r - 1, c)
                     || dfs(b, w, k + 1, r, c + 1) || dfs(b, w, k + 1, r, c - 1);
        b[r][c] = saved;
        return found;
    }
}
