import java.util.*;

final class Cases {
    static List<Object[]> fixed() {
        return List.of(
            iv(new int[][]{{9, 12}, {10, 11}, {11, 13}}),
            iv(new int[][]{{1, 5}, {5, 8}, {8, 9}}),
            iv(new int[][]{{1, 4}, {2, 5}, {3, 6}}),
            iv(new int[0][]),
            iv(new int[][]{{0, 1}}),
            iv(new int[][]{{2, 7}, {2, 7}, {2, 7}, {2, 7}}),
            iv(new int[][]{{8, 9}, {6, 7}, {4, 5}, {2, 3}}),
            iv(new int[][]{{0, 100}, {10, 20}, {20, 30}, {30, 40}}),
            iv(new int[][]{{1, 10}, {2, 3}, {3, 4}, {4, 11}, {9, 12}}),
            iv(new int[][]{{0, 1000000}, {999999, 1000000}, {1000000, 1000001}})
        );
    }

    static Object[] iv(int[][] a) { return new Object[]{(Object) a}; }

    /** Empty input allowed; small times so back-to-back and identical meetings happen. */
    static Object[] random(Random r, int size) {
        int[][] a = new int[size][];
        for (int i = 0; i < size; i++) { int s = r.nextInt(16); a[i] = new int[]{s, s + 1 + r.nextInt(5)}; }
        return iv(a);
    }

    /** Long meetings over a short day: hundreds of rooms in use at once, so scanning open rooms is slow. */
    static Object[] bench(Random r, int n) {
        int[][] a = new int[n][];
        for (int i = 0; i < n; i++) { int s = r.nextInt(n); a[i] = new int[]{s, s + 1 + r.nextInt(1000)}; }
        return iv(a);
    }

    static Object run(Object[] in) { return new Solution().minMeetingRooms((int[][]) in[0]); }
    static Object ref(Object[] in) { return new Ref().minMeetingRooms((int[][]) in[0]); }

    static boolean accept(Object[] in, Object want, Object got) { return Judge.eq(want, got); }
}
