import java.util.*;

class Ref {
    public int maxArea(int[] height) {
        int lo = 0, hi = height.length - 1, best = 0;
        while (lo < hi) {
            int h = Math.min(height[lo], height[hi]);
            best = Math.max(best, h * (hi - lo));
            // The shorter line can't do better with any closer partner, so drop it.
            if (height[lo] < height[hi]) lo++;
            else hi--;
        }
        return best;
    }
}
