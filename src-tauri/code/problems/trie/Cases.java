import java.util.*;

final class Cases {
    static List<Object[]> fixed() {
        return List.of(
            ops(new String[]{"Trie", "insert", "search", "search", "startsWith", "insert", "search"},
                "", "cart", "car", "cart", "car", "car", "car"),
            ops(new String[]{"Trie", "search", "startsWith", "insert", "startsWith", "search"},
                "", "a", "a", "a", "a", "a"),
            ops(new String[]{"Trie", "insert", "startsWith", "startsWith", "search"},
                "", "dog", "dog", "dogs", "do"),
            ops(new String[]{"Trie", "insert", "insert", "search", "search", "startsWith"},
                "", "apple", "apple", "apple", "app", "appl"),
            ops(new String[]{"Trie", "insert", "insert", "search", "search", "search", "startsWith", "startsWith"},
                "", "ab", "abc", "ab", "abc", "a", "abcd", "b"),
            ops(new String[]{"Trie", "insert", "insert", "insert", "search", "search", "startsWith", "search"},
                "", "z", "zz", "zzz", "zzzz", "zz", "zzz", "z"),
            ops(new String[]{"Trie", "insert", "insert", "startsWith", "search", "search"},
                "", "abcdefghijklmnopqrstuvwxyz", "zyxwvutsrqponmlkjihgfedcba", "zyx", "abcdefghijklmnopqrstuvwxy", "zyxwvutsrqponmlkjihgfedcba")
        );
    }

    /** names[i] with one word argument each; the constructor gets no arguments. */
    static Object[] ops(String[] names, String... words) {
        String[][] args = new String[names.length][];
        for (int i = 0; i < names.length; i++) args[i] = names[i].equals("Trie") ? new String[0] : new String[]{words[i]};
        return new Object[]{names, args};
    }

    static final String[] OPS = {"insert", "search", "startsWith"};

    /** Two letters, length 1-3: inserted words and queried prefixes collide constantly. */
    static Object[] random(Random r, int size) {
        int n = size + 1;
        String[] names = new String[n];
        String[] words = new String[n];
        names[0] = "Trie";
        words[0] = "";
        for (int i = 1; i < n; i++) {
            names[i] = OPS[r.nextInt(3)];
            words[i] = Judge.str(r, 1 + r.nextInt(3), "ab");
        }
        return ops(names, words);
    }

    /** n operations, half inserts, words of length 1-8: a set-of-words with a scan for startsWith is n^2. */
    static Object[] bench(Random r, int n) {
        String[] names = new String[n + 1];
        String[] words = new String[n + 1];
        names[0] = "Trie";
        words[0] = "";
        for (int i = 1; i <= n; i++) {
            int k = r.nextInt(4);
            names[i] = k < 2 ? "insert" : OPS[k - 1];
            words[i] = Judge.str(r, 1 + r.nextInt(8), "abcdef");
        }
        return ops(names, words);
    }

    static Object run(Object[] in) {
        String[] names = (String[]) in[0];
        String[][] args = (String[][]) in[1];
        List<Object> out = new ArrayList<>();
        Trie t = null;
        for (int i = 0; i < names.length; i++) {
            switch (names[i]) {
                case "Trie" -> { t = new Trie(); out.add(null); }
                case "insert" -> { t.insert(args[i][0]); out.add(null); }
                case "search" -> out.add(t.search(args[i][0]));
                default -> out.add(t.startsWith(args[i][0]));
            }
        }
        return out;
    }

    static Object ref(Object[] in) {
        String[] names = (String[]) in[0];
        String[][] args = (String[][]) in[1];
        List<Object> out = new ArrayList<>();
        RefTrie t = null;
        for (int i = 0; i < names.length; i++) {
            switch (names[i]) {
                case "Trie" -> { t = new RefTrie(); out.add(null); }
                case "insert" -> { t.insert(args[i][0]); out.add(null); }
                case "search" -> out.add(t.search(args[i][0]));
                default -> out.add(t.startsWith(args[i][0]));
            }
        }
        return out;
    }

    static boolean accept(Object[] in, Object want, Object got) { return Judge.eq(want, got); }
}
