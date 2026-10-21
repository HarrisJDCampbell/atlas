import java.util.*;

final class Cases {
    static final int MIN = Integer.MIN_VALUE, MAX = Integer.MAX_VALUE;

    static List<Object[]> fixed() {
        return List.of(
            lists(ListNode.of(1, 4, 5), ListNode.of(1, 3, 4), ListNode.of(2, 6)),
            lists(null, ListNode.of(1)),
            lists(),
            lists((ListNode) null),
            lists(ListNode.of(5, 6, 7)),
            lists(ListNode.of(-3, -1), ListNode.of(-2), ListNode.of(-5, -4, 0)),
            lists(ListNode.of(1, 1, 1), ListNode.of(1, 1)),
            lists(ListNode.of(MIN, 0), ListNode.of(MAX), ListNode.of(MIN, MAX)),
            lists(ListNode.of(5), ListNode.of(4), ListNode.of(3), ListNode.of(2), ListNode.of(1)),
            lists(ListNode.of(1, 2, 3), null, ListNode.of(4, 5, 6)),
            lists(ListNode.of(1, 2, 3, 4, 5, 6, 7, 8, 9), ListNode.of(0))
        );
    }

    static Object[] lists(ListNode... ls) { return new Object[]{ls}; }

    static Object[] random(Random r, int size) {
        int k = r.nextInt(size / 3 + 2);
        ListNode[] ls = new ListNode[k];
        for (int i = 0; i < k; i++) {
            int[] v = Judge.ints(r, r.nextInt(size / 2 + 2), -10, 10);
            Arrays.sort(v);
            ls[i] = ListNode.of(v);
        }
        return new Object[]{ls};
    }

    /** n nodes spread at random over k = n/8 sorted lists: scanning every head per step is n·k, a heap is n log k. */
    static Object[] bench(Random r, int n) {
        int k = Math.max(1, n / 8);
        int[] owner = new int[n], count = new int[k];
        for (int i = 0; i < n; i++) count[owner[i] = r.nextInt(k)]++;
        int[][] vals = new int[k][];
        for (int i = 0; i < k; i++) vals[i] = new int[count[i]];
        int[] fill = new int[k];
        for (int i = 0; i < n; i++) vals[owner[i]][fill[owner[i]]++] = r.nextInt(1_000_000);
        ListNode[] ls = new ListNode[k];
        for (int i = 0; i < k; i++) { Arrays.sort(vals[i]); ls[i] = ListNode.of(vals[i]); }
        return new Object[]{ls};
    }

    static Object run(Object[] in) { return new Solution().mergeKLists((ListNode[]) in[0]); }
    static Object ref(Object[] in) { return new Ref().mergeKLists((ListNode[]) in[0]); }

    static boolean accept(Object[] in, Object want, Object got) { return Judge.eq(want, got); }
}
