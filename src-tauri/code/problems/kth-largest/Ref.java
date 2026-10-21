import java.util.*;

class Ref {
    public int findKthLargest(int[] nums, int k) {
        // Min-heap of the k largest values seen so far; its top is the kth largest.
        PriorityQueue<Integer> heap = new PriorityQueue<>(k + 1);
        for (int x : nums) {
            heap.offer(x);
            if (heap.size() > k) heap.poll();
        }
        return heap.peek();
    }
}
