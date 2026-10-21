import java.util.*;

class Ref {
    public boolean wordBreak(String s, List<String> wordDict) {
        Set<String> words = new HashSet<>(wordDict);
        int maxLen = 0;
        for (String w : wordDict) maxLen = Math.max(maxLen, w.length());

        // ok[i] = the first i characters of s can be split into dictionary words.
        int n = s.length();
        boolean[] ok = new boolean[n + 1];
        ok[0] = true;
        for (int i = 1; i <= n; i++) {
            // The last word ends at i and is at most maxLen long, so only look that far back.
            for (int len = 1; len <= maxLen && len <= i; len++) {
                if (ok[i - len] && words.contains(s.substring(i - len, i))) { ok[i] = true; break; }
            }
        }
        return ok[n];
    }
}
