import java.util.*;

class Ref {
    public String minWindow(String s, String t) {
        int[] need = new int[128];
        for (int i = 0; i < t.length(); i++) need[t.charAt(i)]++;
        int missing = t.length();             // chars of t (with multiplicity) not yet covered
        int bestLo = 0, bestLen = Integer.MAX_VALUE;
        for (int lo = 0, hi = 0; hi < s.length(); hi++) {
            if (need[s.charAt(hi)]-- > 0) missing--;
            while (missing == 0) {
                // Strict < keeps the earliest window among equal lengths, which is also the leftmost.
                if (hi - lo + 1 < bestLen) { bestLen = hi - lo + 1; bestLo = lo; }
                if (++need[s.charAt(lo++)] > 0) missing++;
            }
        }
        return bestLen == Integer.MAX_VALUE ? "" : s.substring(bestLo, bestLo + bestLen);
    }
}
