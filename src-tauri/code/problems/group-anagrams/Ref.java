import java.util.*;

class Ref {
    public List<List<String>> groupAnagrams(String[] strs) {
        // LinkedHashMap only so the output order is predictable; any order is accepted.
        Map<String, List<String>> groups = new LinkedHashMap<>();
        for (String s : strs) {
            char[] key = s.toCharArray();
            Arrays.sort(key);
            groups.computeIfAbsent(new String(key), x -> new ArrayList<>()).add(s);
        }
        return new ArrayList<>(groups.values());
    }
}
