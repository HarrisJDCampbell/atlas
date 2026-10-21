class Ref {
    public int rob(int[] nums) {
        // take = best total that uses the current house; skip = best total that doesn't.
        int take = 0, skip = 0;
        for (int x : nums) {
            int newTake = skip + x;           // using x means the previous house was skipped
            skip = Math.max(skip, take);      // not using x keeps the better of the two
            take = newTake;
        }
        return Math.max(take, skip);
    }
}
