class Ref {
    public int longestCommonSubsequence(String text1, String text2) {
        int m = text1.length(), n = text2.length();
        // prev = row i-1 of the table, cur = row i. dp[j] = LCS of the prefixes ending before i and j.
        int[] prev = new int[n + 1], cur = new int[n + 1];
        for (int i = 1; i <= m; i++) {
            char c = text1.charAt(i - 1);
            for (int j = 1; j <= n; j++) {
                if (c == text2.charAt(j - 1)) cur[j] = prev[j - 1] + 1;
                else cur[j] = Math.max(prev[j], cur[j - 1]);
            }
            int[] t = prev; prev = cur; cur = t;
        }
        return prev[n];
    }
}
