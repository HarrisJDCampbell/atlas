import java.util.*;

final class Cases {
    static final String PRINTABLE;
    static {
        StringBuilder sb = new StringBuilder();
        for (char c = ' '; c <= '~'; c++) sb.append(c);
        PRINTABLE = sb.toString();
    }

    static List<Object[]> fixed() {
        return List.of(
            new Object[]{"abcabcbb"},
            new Object[]{"bbbbb"},
            new Object[]{"pwwkew"},
            new Object[]{""},
            new Object[]{" "},
            new Object[]{"au"},
            new Object[]{"dvdf"},
            new Object[]{"abba"},
            new Object[]{"tmmzuxt"},
            new Object[]{"abcdefghij"},
            new Object[]{"a b!c a?"},
            new Object[]{"aab"}
        );
    }

    static Object[] random(Random r, int size) {
        return new Object[]{Judge.str(r, size, r.nextBoolean() ? "abc" : "abcd e")};
    }

    /** All 95 printable characters in a fixed shuffled order, repeated: every window grows to 95 before it repeats, which is the worst case for restarting the scan at each index. */
    static Object[] bench(Random r, int n) {
        char[] perm = PRINTABLE.toCharArray();
        for (int i = perm.length - 1; i > 0; i--) { int k = r.nextInt(i + 1); char t = perm[i]; perm[i] = perm[k]; perm[k] = t; }
        char[] s = new char[n];
        for (int i = 0; i < n; i++) s[i] = perm[i % perm.length];
        return new Object[]{new String(s)};
    }

    static Object run(Object[] in) { return new Solution().lengthOfLongestSubstring((String) in[0]); }
    static Object ref(Object[] in) { return new Ref().lengthOfLongestSubstring((String) in[0]); }

    static boolean accept(Object[] in, Object want, Object got) { return Judge.eq(want, got); }
}
