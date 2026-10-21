import java.util.*;

// Lists are stored as int[] (least significant digit first) and built inside run()/ref():
// the harness copies ListNode inputs through ListNode.values, which stops at 100k nodes.
final class Cases {
    static List<Object[]> fixed() {
        return List.of(
            new Object[]{new int[]{8, 1}, new int[]{5, 3}},
            new Object[]{new int[]{9, 9, 9}, new int[]{2}},
            new Object[]{new int[]{0}, new int[]{0}},
            new Object[]{new int[]{5}, new int[]{5}},
            new Object[]{new int[]{0}, new int[]{4, 2, 7}},
            new Object[]{new int[]{1, 8}, new int[]{0}},
            new Object[]{new int[]{9, 9, 9, 9, 9, 9, 9}, new int[]{9, 9, 9, 9}},
            new Object[]{new int[]{1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1}, new int[]{5, 6, 4}}
        );
    }

    /** A valid number: digits 0..9, no leading zero (so the last stored digit is non-zero) unless it's just 0. */
    static int[] number(Random r, int len) {
        int[] d = Judge.ints(r, len, 0, 9);
        if (len > 1 && d[len - 1] == 0) d[len - 1] = 1 + r.nextInt(9);
        return d;
    }

    static Object[] random(Random r, int size) {
        int a = 1 + r.nextInt(Math.max(1, size)), b = 1 + r.nextInt(Math.max(1, size));
        int[] x = number(r, a), y = number(r, b);
        if (r.nextInt(4) == 0) Arrays.fill(x, 9); // long carry chains
        return new Object[]{x, y};
    }

    /** Two n-digit numbers: far past long, and quadratic for decimal BigInteger parsing and printing. */
    static Object[] bench(Random r, int n) {
        return new Object[]{number(r, n), number(r, n)};
    }

    static Object run(Object[] in) { return new Solution().addTwoNumbers(ListNode.of((int[]) in[0]), ListNode.of((int[]) in[1])); }
    static Object ref(Object[] in) { return new Ref().addTwoNumbers(ListNode.of((int[]) in[0]), ListNode.of((int[]) in[1])); }

    static boolean accept(Object[] in, Object want, Object got) { return Judge.eq(want, got); }
}
