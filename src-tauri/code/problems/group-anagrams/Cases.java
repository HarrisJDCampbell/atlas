import java.util.*;

final class Cases {
    static List<Object[]> fixed() {
        return List.of(
            new Object[]{new String[]{"eat", "tea", "tan", "ate", "nat", "bat"}},
            new Object[]{new String[]{""}},
            new Object[]{new String[]{"a"}},
            new Object[]{new String[]{"", "", "b", ""}},
            new Object[]{new String[]{"abc", "bca", "cab", "abc"}},
            new Object[]{new String[]{"ab", "ba", "aab", "aba", "abb"}},
            new Object[]{new String[]{"ddddddddddb", "bdddddddddd", "dddddddddbd", "dddddddddd"}},
            new Object[]{new String[]{"x", "y", "z", "xy", "yx", "zz"}}
        );
    }

    static Object[] random(Random r, int size) {
        int n = Math.max(1, size);
        String[] a = new String[n];
        for (int i = 0; i < n; i++) a[i] = Judge.str(r, r.nextInt(4), "abc");
        return new Object[]{a};
    }

    /** n/3 random 7-letter roots, each appearing as ~3 shuffled anagrams: lots of groups, so pairwise comparison is quadratic. */
    static Object[] bench(Random r, int n) {
        String[] a = new String[n];
        int roots = Math.max(1, n / 3);
        String[] base = new String[roots];
        for (int i = 0; i < roots; i++) base[i] = Judge.str(r, 7, "abcdefghijklmnopqrstuvwxyz");
        for (int i = 0; i < n; i++) {
            char[] c = base[r.nextInt(roots)].toCharArray();
            for (int j = c.length - 1; j > 0; j--) { int k = r.nextInt(j + 1); char t = c[j]; c[j] = c[k]; c[k] = t; }
            a[i] = new String(c);
        }
        return new Object[]{a};
    }

    static Object run(Object[] in) { return new Solution().groupAnagrams((String[]) in[0]); }
    static Object ref(Object[] in) { return new Ref().groupAnagrams((String[]) in[0]); }

    static boolean accept(Object[] in, Object want, Object got) { return got != null && Judge.sameBagDeep(want, got); }
}
