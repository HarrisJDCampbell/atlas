import java.util.*;

class Ref {
    public int lengthOfLongestSubstring(String s) {
        int[] last = new int[128];          // last[c] = 1 + index of c's latest occurrence, 0 if unseen
        int best = 0, lo = 0;
        for (int hi = 0; hi < s.length(); hi++) {
            char c = s.charAt(hi);
            lo = Math.max(lo, last[c]);     // jump past the previous copy of c, never backwards
            last[c] = hi + 1;
            best = Math.max(best, hi - lo + 1);
        }
        return best;
    }
}
