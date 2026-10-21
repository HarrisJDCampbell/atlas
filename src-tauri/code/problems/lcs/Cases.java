import java.util.*;

final class Cases {
    static List<Object[]> fixed() {
        return List.of(
            new Object[]{"kitten", "sitting"},
            new Object[]{"stone", "longest"},
            new Object[]{"abc", "xyz"},
            new Object[]{"a", "a"},
            new Object[]{"a", "b"},
            new Object[]{"aaaa", "aa"},
            new Object[]{"abcdef", "abcdef"},
            new Object[]{"abcd", "dcba"},
            new Object[]{"bdf", "abcdefg"},
            new Object[]{"zzzzzzzzzz", "z"},
            new Object[]{"abab", "baba"}
        );
    }

    /** Tiny alphabet so characters repeat and the max(skip one, skip other) branch matters. */
    static Object[] random(Random r, int size) {
        int s = Math.max(1, size);
        return new Object[]{Judge.str(r, 1 + r.nextInt(s), "abc"), Judge.str(r, 1 + r.nextInt(s), "abc")};
    }

    /** Two random strings of length n: plain recursion is exponential, the table is n^2. */
    static Object[] bench(Random r, int n) {
        return new Object[]{Judge.str(r, n, "abcd"), Judge.str(r, n, "abcd")};
    }

    static Object run(Object[] in) { return new Solution().longestCommonSubsequence((String) in[0], (String) in[1]); }
    static Object ref(Object[] in) { return new Ref().longestCommonSubsequence((String) in[0], (String) in[1]); }

    static boolean accept(Object[] in, Object want, Object got) { return Judge.eq(want, got); }
}
