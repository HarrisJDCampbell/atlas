class Ref {
    public int lengthOfLIS(int[] nums) {
        // tails[k] = smallest possible last value of a strictly increasing subsequence of length k + 1.
        // tails is always strictly increasing, so we can binary search it.
        int[] tails = new int[nums.length];
        int len = 0;
        for (int x : nums) {
            int lo = 0, hi = len;              // first index with tails[i] >= x
            while (lo < hi) {
                int mid = (lo + hi) >>> 1;
                if (tails[mid] < x) lo = mid + 1; else hi = mid;
            }
            tails[lo] = x;                     // extend (lo == len) or lower an existing tail
            if (lo == len) len++;
        }
        return len;
    }
}
