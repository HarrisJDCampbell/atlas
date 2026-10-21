import java.util.*;

final class Cases {
    static List<Object[]> fixed() {
        return List.of(
            new Object[]{"hotdogstand", List.of("hot", "dog", "stand", "hotdog")},
            new Object[]{"dogsandcat", List.of("dog", "dogs", "sand", "and", "cats")},
            new Object[]{"bookbook", List.of("book")},
            new Object[]{"a", List.of("a")},
            new Object[]{"a", List.of("b")},
            new Object[]{"ab", List.of("abc", "b")},
            new Object[]{"abcd", List.of("a", "abc", "b", "cd")},
            new Object[]{"aaaaaaa", List.of("aaaa", "aaa")},
            new Object[]{"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaab", List.of("a", "aa", "aaa", "aaaa", "aaaaa")},
            new Object[]{"carsandcats", List.of("car", "cars", "and", "sand", "cat")},
            new Object[]{"xyz", List.of("xyz", "x", "y")}
        );
    }

    /**
     * s over "ab" with a small dictionary of short words. Half the time s is built from
     * dictionary words, so "true" answers are common; the rest are usually "false".
     */
    static Object[] random(Random r, int size) {
        Set<String> dict = new LinkedHashSet<>();
        int k = 1 + r.nextInt(5);
        while (dict.size() < k) dict.add(Judge.str(r, 1 + r.nextInt(3), "ab"));
        List<String> words = new ArrayList<>(dict);
        int n = Math.max(1, size);
        String s;
        if (r.nextBoolean()) {
            StringBuilder sb = new StringBuilder();
            while (sb.length() < n) sb.append(words.get(r.nextInt(words.size())));
            s = sb.toString();
        } else {
            s = Judge.str(r, n, "ab");
        }
        return new Object[]{s, words};
    }

    /**
     * "aaa…ab" with every run of a's up to length 10 in the dictionary: every prefix of a's can be
     * split many ways, but the final 'b' makes the answer false, so a search without memoization
     * explores exponentially many splits before giving up.
     */
    static Object[] bench(Random r, int n) {
        List<String> dict = new ArrayList<>();
        for (int len = 1; len <= 10; len++) dict.add("a".repeat(len));
        return new Object[]{"a".repeat(n - 1) + "b", dict};
    }

    @SuppressWarnings("unchecked")
    static Object run(Object[] in) { return new Solution().wordBreak((String) in[0], (List<String>) in[1]); }
    @SuppressWarnings("unchecked")
    static Object ref(Object[] in) { return new Ref().wordBreak((String) in[0], (List<String>) in[1]); }

    static boolean accept(Object[] in, Object want, Object got) { return Judge.eq(want, got); }
}
