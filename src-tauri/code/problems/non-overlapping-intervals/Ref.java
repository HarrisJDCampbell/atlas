import java.util.*;

class Ref {
    public int eraseOverlapIntervals(int[][] intervals) {
        // Keep the interval that finishes first; it leaves the most room for the rest.
        Arrays.sort(intervals, (a, b) -> Integer.compare(a[1], b[1]));
        int kept = 0;
        long end = Long.MIN_VALUE;
        for (int[] iv : intervals) {
            if (iv[0] >= end) { kept++; end = iv[1]; } // touching is fine
        }
        return intervals.length - kept;
    }
}
