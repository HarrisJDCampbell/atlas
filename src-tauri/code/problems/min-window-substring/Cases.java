import java.util.*;

final class Cases {
    static List<Object[]> fixed() {
        return List.of(
            new Object[]{"ADOBECODEBANC", "ABC"},
            new Object[]{"a", "a"},
            new Object[]{"a", "aa"},
            new Object[]{"a", "b"},
            new Object[]{"ab", "abc"},
            new Object[]{"baab", "ab"},
            new Object[]{"aaflslflsldkalskaaa", "aaa"},
            new Object[]{"abcdef", "fa"},
            new Object[]{"bba", "ab"},
            new Object[]{"aA", "A"},
            new Object[]{"cabwefgewcwaefgcf", "cae"},
            new Object[]{"xyzxyz", "zyx"}
        );
    }

    static Object[] random(Random r, int size) {
        String s = Judge.str(r, Math.max(1, size), "abc");
        String t = Judge.str(r, 1 + r.nextInt(Math.min(4, Math.max(1, size)) + 1), "abc");
        return new Object[]{s, t};
    }

    /** s is random a..y with one 'z' at the very end, and t needs that 'z': expanding from every start scans to the end, n^2 total. */
    static Object[] bench(Random r, int n) {
        String s = Judge.str(r, n - 1, "abcdefghijklmnopqrstuvwxy") + "z";
        String t = "z" + Judge.str(r, 12, "abcdefghijklmnopqrstuvwxy");
        return new Object[]{s, t};
    }

    static Object run(Object[] in) { return new Solution().minWindow((String) in[0], (String) in[1]); }
    static Object ref(Object[] in) { return new Ref().minWindow((String) in[0], (String) in[1]); }

    static boolean accept(Object[] in, Object want, Object got) { return Judge.eq(want, got); }
}
