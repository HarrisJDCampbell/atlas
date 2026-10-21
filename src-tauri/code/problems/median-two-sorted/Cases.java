import java.util.*;

final class Cases {
    static List<Object[]> fixed() {
        return List.of(
            new Object[]{new int[]{1, 4}, new int[]{2}},
            new Object[]{new int[]{1, 3}, new int[]{2, 6}},
            new Object[]{new int[]{}, new int[]{7}},
            new Object[]{new int[]{5}, new int[]{}},
            new Object[]{new int[]{}, new int[]{1, 2}},
            new Object[]{new int[]{1, 2, 3}, new int[]{10, 11, 12}},
            new Object[]{new int[]{10, 11, 12}, new int[]{1, 2}},
            new Object[]{new int[]{2, 2, 2}, new int[]{2, 2}},
            new Object[]{new int[]{-5, -3, -1}, new int[]{-4, -2}},
            new Object[]{new int[]{1}, new int[]{2, 3, 4, 5, 6, 7, 8}},
            new Object[]{new int[]{Integer.MAX_VALUE}, new int[]{Integer.MAX_VALUE}},
            new Object[]{new int[]{Integer.MIN_VALUE}, new int[]{Integer.MIN_VALUE + 1}}
        );
    }

    /** Two sorted arrays (either may be empty), at least one element in total. */
    static Object[] random(Random r, int size) {
        int total = Math.max(1, size);
        int m = r.nextInt(total + 1);
        int[] a = Judge.ints(r, m, -10, 10), b = Judge.ints(r, total - m, -10, 10);
        Arrays.sort(a);
        Arrays.sort(b);
        return new Object[]{a, b};
    }

    static Object[] bench(Random r, int n) { return null; }

    static Object run(Object[] in) { return new Solution().findMedianSortedArrays((int[]) in[0], (int[]) in[1]); }
    static Object ref(Object[] in) { return new Ref().findMedianSortedArrays((int[]) in[0], (int[]) in[1]); }

    static boolean accept(Object[] in, Object want, Object got) { return Judge.eq(want, got); }
}
