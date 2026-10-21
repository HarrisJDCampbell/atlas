class Ref {
    public int uniquePathsWithObstacles(int[][] obstacleGrid) {
        int cols = obstacleGrid[0].length;
        // dp[j] = paths into cell (current row, j). Before the update it still holds the row above.
        int[] dp = new int[cols];
        dp[0] = 1;
        for (int[] row : obstacleGrid) {
            for (int j = 0; j < cols; j++) {
                if (row[j] == 1) dp[j] = 0;
                else if (j > 0) dp[j] += dp[j - 1];
            }
        }
        return dp[cols - 1];
    }
}
