class Ref {
    public int minDistance(String word1, String word2) {
        int m = word1.length(), n = word2.length();
        // prev[j] = cost to turn the first i-1 chars of word1 into the first j chars of word2.
        int[] prev = new int[n + 1], cur = new int[n + 1];
        for (int j = 0; j <= n; j++) prev[j] = j;
        for (int i = 1; i <= m; i++) {
            cur[0] = i;
            char c = word1.charAt(i - 1);
            for (int j = 1; j <= n; j++) {
                if (c == word2.charAt(j - 1)) cur[j] = prev[j - 1];
                else cur[j] = 1 + Math.min(prev[j - 1], Math.min(prev[j], cur[j - 1]));
            }
            int[] t = prev; prev = cur; cur = t;
        }
        return prev[n];
    }
}
