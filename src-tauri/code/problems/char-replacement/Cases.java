import java.util.*;

final class Cases {
    static List<Object[]> fixed() {
        return List.of(
            new Object[]{"ABAB", 2},
            new Object[]{"AABABBA", 1},
            new Object[]{"A", 0},
            new Object[]{"ABCDE", 0},
            new Object[]{"AAAA", 0},
            new Object[]{"AAAA", 4},
            new Object[]{"ABCDE", 10},
            new Object[]{"ABBB", 2},
            new Object[]{"BAAAB", 0},
            new Object[]{"ABAA", 0},
            new Object[]{"ABCABCABCAAAA", 2},
            new Object[]{"ZYZYZZZXZ", 1}
        );
    }

    static Object[] random(Random r, int size) {
        int n = Math.max(1, size);
        return new Object[]{Judge.str(r, n, r.nextBoolean() ? "AB" : "ABC"), r.nextInt(Math.min(n, 4) + 1)};
    }

    /** Mostly 'A' with ~1 in 8 letters random, k = n/16: the best window spans about half the string, so extending a window from every start is n^2. */
    static Object[] bench(Random r, int n) {
        char[] c = new char[n];
        for (int i = 0; i < n; i++) c[i] = r.nextInt(8) == 0 ? (char) ('A' + r.nextInt(26)) : 'A';
        return new Object[]{new String(c), Math.max(1, n / 16)};
    }

    static Object run(Object[] in) { return new Solution().characterReplacement((String) in[0], (int) in[1]); }
    static Object ref(Object[] in) { return new Ref().characterReplacement((String) in[0], (int) in[1]); }

    static boolean accept(Object[] in, Object want, Object got) { return Judge.eq(want, got); }
}
