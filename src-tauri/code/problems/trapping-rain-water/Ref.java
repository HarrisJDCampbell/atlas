import java.util.*;

class Ref {
    public int trap(int[] height) {
        int lo = 0, hi = height.length - 1, leftMax = 0, rightMax = 0, water = 0;
        while (lo < hi) {
            // The lower side's level is settled: the other side already has a wall at least this tall.
            if (height[lo] < height[hi]) {
                leftMax = Math.max(leftMax, height[lo]);
                water += leftMax - height[lo];
                lo++;
            } else {
                rightMax = Math.max(rightMax, height[hi]);
                water += rightMax - height[hi];
                hi--;
            }
        }
        return water;
    }
}
