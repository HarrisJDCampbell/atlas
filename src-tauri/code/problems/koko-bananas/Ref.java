class Ref {
    public int minEatingSpeed(int[] piles, int h) {
        int lo = 1, hi = 1;
        for (int p : piles) hi = Math.max(hi, p);
        // Invariant: speed hi is fast enough; find the smallest speed that is.
        while (lo < hi) {
            int mid = lo + (hi - lo) / 2;
            if (hoursAt(piles, mid) <= h) hi = mid;
            else lo = mid + 1;
        }
        return lo;
    }

    private static long hoursAt(int[] piles, int speed) {
        long hours = 0; // can reach 10^4 * 10^9 at speed 1, far past int
        for (int p : piles) hours += (p - 1) / speed + 1; // ceil(p / speed) without overflowing p + speed
        return hours;
    }
}
