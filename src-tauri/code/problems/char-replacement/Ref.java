import java.util.*;

class Ref {
    public int characterReplacement(String s, int k) {
        int[] count = new int[26];
        int lo = 0, maxFreq = 0, best = 0;
        for (int hi = 0; hi < s.length(); hi++) {
            maxFreq = Math.max(maxFreq, ++count[s.charAt(hi) - 'A']);
            // Too many letters to repaint: slide (don't shrink) the window. maxFreq may be stale,
            // but a stale value can only keep the window at the best size already found.
            if (hi - lo + 1 - maxFreq > k) count[s.charAt(lo++) - 'A']--;
            best = Math.max(best, hi - lo + 1);
        }
        return best;
    }
}
