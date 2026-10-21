import java.util.*;

final class Cases {
    static List<Object[]> fixed() {
        return List.of(
            new Object[]{new int[]{30, 40, 35, 32, 50, 45}},
            new Object[]{new int[]{60, 50, 40, 70}},
            new Object[]{new int[]{20, 20, 20}},
            new Object[]{new int[]{42}},
            new Object[]{new int[]{1, 2, 3, 4, 5}},
            new Object[]{new int[]{5, 4, 3, 2, 1}},
            new Object[]{new int[]{-5, -10, -3, -3, 0}},
            new Object[]{new int[]{70, 71, 70, 71, 70, 71}},
            new Object[]{new int[]{Integer.MAX_VALUE, Integer.MIN_VALUE, Integer.MAX_VALUE}}
        );
    }

    static Object[] random(Random r, int size) {
        return new Object[]{Judge.ints(r, Math.max(1, size), -5, 5)};
    }

    /** Strictly falling, then one spike at the end: scanning ahead from each day walks to the end every time. */
    static Object[] bench(Random r, int n) {
        int[] t = new int[n];
        for (int i = 0; i < n - 1; i++) t[i] = n - i;
        t[n - 1] = n + 1;
        return new Object[]{t};
    }

    static Object run(Object[] in) { return new Solution().dailyTemperatures((int[]) in[0]); }
    static Object ref(Object[] in) { return new Ref().dailyTemperatures((int[]) in[0]); }

    static boolean accept(Object[] in, Object want, Object got) { return Judge.eq(want, got); }
}
