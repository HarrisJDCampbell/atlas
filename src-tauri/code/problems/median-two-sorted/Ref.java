class Ref {
    public double findMedianSortedArrays(int[] nums1, int[] nums2) {
        if (nums1.length > nums2.length) return findMedianSortedArrays(nums2, nums1); // search the shorter array
        int m = nums1.length, n = nums2.length;
        int half = (m + n + 1) / 2; // size of the left part; it gets the extra element when the total is odd
        int lo = 0, hi = m;
        while (lo <= hi) {
            int i = lo + (hi - lo) / 2; // elements taken from nums1 into the left part
            int j = half - i;           // elements taken from nums2
            long aLeft = i == 0 ? Long.MIN_VALUE : nums1[i - 1];
            long aRight = i == m ? Long.MAX_VALUE : nums1[i];
            long bLeft = j == 0 ? Long.MIN_VALUE : nums2[j - 1];
            long bRight = j == n ? Long.MAX_VALUE : nums2[j];
            if (aLeft > bRight) hi = i - 1;      // took too many from nums1
            else if (bLeft > aRight) lo = i + 1; // took too few from nums1
            else {
                long leftMax = Math.max(aLeft, bLeft);
                if ((m + n) % 2 == 1) return leftMax;
                long rightMin = Math.min(aRight, bRight);
                return (leftMax + rightMin) / 2.0; // long sum: two ints near MAX_VALUE would overflow
            }
        }
        throw new IllegalArgumentException("inputs are not sorted");
    }
}
