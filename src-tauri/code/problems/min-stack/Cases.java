import java.util.*;

final class Cases {
    static final int[] NONE = new int[0];

    static List<Object[]> fixed() {
        return List.of(
            ops(new String[]{"MinStack", "push", "push", "push", "getMin", "pop", "top", "getMin"},
                new int[][]{NONE, {4}, {7}, {2}, NONE, NONE, NONE, NONE}),
            ops(new String[]{"MinStack", "push", "push", "getMin", "pop", "getMin"},
                new int[][]{NONE, {3}, {3}, NONE, NONE, NONE}),
            ops(new String[]{"MinStack", "push", "top", "getMin"},
                new int[][]{NONE, {-5}, NONE, NONE}),
            ops(new String[]{"MinStack", "push", "push", "push", "getMin", "pop", "getMin", "pop", "getMin"},
                new int[][]{NONE, {1}, {2}, {3}, NONE, NONE, NONE, NONE, NONE}),
            ops(new String[]{"MinStack", "push", "push", "push", "getMin", "pop", "getMin", "pop", "getMin"},
                new int[][]{NONE, {3}, {2}, {1}, NONE, NONE, NONE, NONE, NONE}),
            ops(new String[]{"MinStack", "push", "push", "getMin", "top", "pop", "getMin", "top"},
                new int[][]{NONE, {Integer.MAX_VALUE}, {Integer.MIN_VALUE}, NONE, NONE, NONE, NONE, NONE}),
            ops(new String[]{"MinStack", "push", "pop", "push", "getMin", "top"},
                new int[][]{NONE, {9}, NONE, {11}, NONE, NONE}),
            ops(new String[]{"MinStack", "push", "push", "push", "push", "pop", "pop", "getMin", "top"},
                new int[][]{NONE, {0}, {-1}, {0}, {-1}, NONE, NONE, NONE, NONE})
        );
    }

    static Object[] ops(String[] names, int[][] args) { return new Object[]{names, args}; }

    /** Never pops, peeks or asks for the min on an empty stack. Small values so the min repeats. */
    static Object[] random(Random r, int size) {
        return gen(r, size, 5);
    }

    /** Mostly pushes, so the stack grows to ~n/2 and a getMin that scans the stack is n^2 overall. */
    static Object[] bench(Random r, int n) {
        return gen(r, n, Integer.MAX_VALUE);
    }

    static Object[] gen(Random r, int n, int range) {
        String[] names = new String[n + 1];
        int[][] args = new int[n + 1][];
        names[0] = "MinStack";
        args[0] = NONE;
        int depth = 0;
        for (int i = 1; i <= n; i++) {
            int k = r.nextInt(20);
            if (depth == 0 || k < 12) {
                names[i] = "push";
                int v = range == Integer.MAX_VALUE ? r.nextInt() : r.nextInt(2 * range + 1) - range;
                args[i] = new int[]{v};
                depth++;
            } else {
                names[i] = k < 15 ? "pop" : k < 17 ? "top" : "getMin";
                args[i] = NONE;
                if (k < 15) depth--;
            }
        }
        return ops(names, args);
    }

    static Object run(Object[] in) {
        String[] names = (String[]) in[0];
        int[][] args = (int[][]) in[1];
        List<Object> out = new ArrayList<>();
        MinStack s = null;
        for (int i = 0; i < names.length; i++) {
            switch (names[i]) {
                case "MinStack" -> { s = new MinStack(); out.add(null); }
                case "push" -> { s.push(args[i][0]); out.add(null); }
                case "pop" -> { s.pop(); out.add(null); }
                case "top" -> out.add(s.top());
                default -> out.add(s.getMin());
            }
        }
        return out;
    }

    static Object ref(Object[] in) {
        String[] names = (String[]) in[0];
        int[][] args = (int[][]) in[1];
        List<Object> out = new ArrayList<>();
        RefMinStack s = null;
        for (int i = 0; i < names.length; i++) {
            switch (names[i]) {
                case "MinStack" -> { s = new RefMinStack(); out.add(null); }
                case "push" -> { s.push(args[i][0]); out.add(null); }
                case "pop" -> { s.pop(); out.add(null); }
                case "top" -> out.add(s.top());
                default -> out.add(s.getMin());
            }
        }
        return out;
    }

    static boolean accept(Object[] in, Object want, Object got) { return Judge.eq(want, got); }
}
