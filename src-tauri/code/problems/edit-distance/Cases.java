import java.util.*;

final class Cases {
    static List<Object[]> fixed() {
        return List.of(
            new Object[]{"kitten", "sitting"},
            new Object[]{"sunday", "saturday"},
            new Object[]{"", "abc"},
            new Object[]{"", ""},
            new Object[]{"a", ""},
            new Object[]{"abc", "abc"},
            new Object[]{"abc", "cba"},
            new Object[]{"aaaa", "bbbb"},
            new Object[]{"flaw", "lawn"},
            new Object[]{"abcdef", "azced"},
            new Object[]{"a", "aaaaaa"}
        );
    }

    /** Empty strings allowed; a 3-letter alphabet makes matches common. */
    static Object[] random(Random r, int size) {
        return new Object[]{Judge.str(r, r.nextInt(size + 1), "abc"), Judge.str(r, r.nextInt(size + 1), "abc")};
    }

    /** Two random strings of length n: the three-way recursion is exponential, the table is n^2. */
    static Object[] bench(Random r, int n) {
        return new Object[]{Judge.str(r, n, "abcd"), Judge.str(r, n, "abcd")};
    }

    static Object run(Object[] in) { return new Solution().minDistance((String) in[0], (String) in[1]); }
    static Object ref(Object[] in) { return new Ref().minDistance((String) in[0], (String) in[1]); }

    static boolean accept(Object[] in, Object want, Object got) { return Judge.eq(want, got); }
}
