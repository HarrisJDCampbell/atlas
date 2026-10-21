import java.util.*;

// Lists are stored as int[] and built inside run()/ref(): the harness copies ListNode inputs
// through ListNode.values, which stops at 100k nodes, and the bench goes past that.
final class Cases {
    static List<Object[]> fixed() {
        return List.of(
            new Object[]{new int[]{1, 2, 3, 4}},
            new Object[]{new int[]{5, 9}},
            new Object[]{new int[]{7}},
            new Object[]{new int[]{}},
            new Object[]{new int[]{3, 3, 3}},
            new Object[]{new int[]{-1, 0, 1, -1}},
            new Object[]{new int[]{1, 2, 3, 4, 5, 6, 7, 8, 9, 10}}
        );
    }

    static Object[] random(Random r, int size) {
        return new Object[]{Judge.ints(r, size, -10, 10)};
    }

    static Object[] bench(Random r, int n) {
        return new Object[]{Judge.ints(r, n, -1000, 1000)};
    }

    static Object run(Object[] in) { return new Solution().reverseList(ListNode.of((int[]) in[0])); }
    static Object ref(Object[] in) { return new Ref().reverseList(ListNode.of((int[]) in[0])); }

    static boolean accept(Object[] in, Object want, Object got) { return Judge.eq(want, got); }
}
