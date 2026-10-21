import java.util.*;

final class Cases {
    static List<Object[]> fixed() {
        return List.of(
            new Object[]{"()"},
            new Object[]{"([]{})"},
            new Object[]{"(]"},
            new Object[]{"([)]"},
            new Object[]{"{[()()]}"},
            new Object[]{""},
            new Object[]{"("},
            new Object[]{"]"},
            new Object[]{"(("},
            new Object[]{"())("},
            new Object[]{"}{"},
            new Object[]{"[[[]]]{}"}
        );
    }

    /** Half the time a balanced string (maybe with one character flipped), otherwise noise. */
    static Object[] random(Random r, int size) {
        if (r.nextBoolean()) return new Object[]{Judge.str(r, size, "()[]{}")};
        String opens = "([{", closes = ")]}";
        StringBuilder sb = new StringBuilder();
        Deque<Integer> st = new ArrayDeque<>();
        int pairs = size / 2;
        int opened = 0;
        while (opened < pairs || !st.isEmpty()) {
            if (opened < pairs && (st.isEmpty() || r.nextBoolean())) {
                int k = r.nextInt(3);
                st.push(k);
                sb.append(opens.charAt(k));
                opened++;
            } else {
                sb.append(closes.charAt(st.pop()));
            }
        }
        if (sb.length() > 0 && r.nextInt(3) == 0) {
            int i = r.nextInt(sb.length());
            sb.setCharAt(i, "()[]{}".charAt(r.nextInt(6)));
        }
        return new Object[]{sb.toString()};
    }

    /** Fully nested and valid: a "delete every adjacent pair, repeat" approach needs n/2 passes. */
    static Object[] bench(Random r, int n) {
        String opens = "([{", closes = ")]}";
        int half = n / 2;
        int[] kind = new int[half];
        for (int i = 0; i < half; i++) kind[i] = r.nextInt(3);
        StringBuilder sb = new StringBuilder(n);
        for (int i = 0; i < half; i++) sb.append(opens.charAt(kind[i]));
        for (int i = half - 1; i >= 0; i--) sb.append(closes.charAt(kind[i]));
        return new Object[]{sb.toString()};
    }

    static Object run(Object[] in) { return new Solution().isValid((String) in[0]); }
    static Object ref(Object[] in) { return new Ref().isValid((String) in[0]); }

    static boolean accept(Object[] in, Object want, Object got) { return Judge.eq(want, got); }
}
