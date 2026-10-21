import java.util.*;

// Lists are stored as int[] and built inside run()/ref(): the harness copies ListNode inputs
// through ListNode.values, which stops at 100k nodes, and the bench goes past that.
// reorderList is void, so run()/ref() keep the head they passed in and return it.
final class Cases {
    static List<Object[]> fixed() {
        return List.of(
            new Object[]{new int[]{10, 20, 30, 40}},
            new Object[]{new int[]{1, 2, 3, 4, 5}},
            new Object[]{new int[]{8}},
            new Object[]{new int[]{1, 2}},
            new Object[]{new int[]{1, 2, 3}},
            new Object[]{new int[]{4, 4, 4, 4, 4, 4}},
            new Object[]{new int[]{-3, 7, -1, 0, 9, 2}},
            new Object[]{new int[]{1, 2, 3, 4, 5, 6, 7, 8, 9}}
        );
    }

    static Object[] random(Random r, int size) {
        return new Object[]{Judge.ints(r, Math.max(1, size), -10, 10)};
    }

    /** A long list: walking to the tail for every step is quadratic. */
    static Object[] bench(Random r, int n) {
        return new Object[]{Judge.ints(r, n, -1000, 1000)};
    }

    static Object run(Object[] in) {
        ListNode head = ListNode.of((int[]) in[0]);
        new Solution().reorderList(head);
        return head;
    }

    static Object ref(Object[] in) {
        ListNode head = ListNode.of((int[]) in[0]);
        new Ref().reorderList(head);
        return head;
    }

    static boolean accept(Object[] in, Object want, Object got) { return Judge.eq(want, got); }
}
