import java.util.*;

public class Main {
    static Map<Character, Integer> count(String s) {
        Map<Character, Integer> m = new HashMap<>();
        for (char c : s.toCharArray()) m.merge(c, 1, Integer::sum);
        return m;
    }

    public static void main(String[] args) {
        Map<Character, Integer> s1 = count("aab"), t1 = count("aba");
        System.out.println(s1.get('a') == t1.get('a'));
        Map<Character, Integer> s2 = count("a".repeat(200)), t2 = count("a".repeat(200));
        System.out.println(s2.get('a') == t2.get('a'));
        System.out.println(s2.get('a').equals(t2.get('a')));
        System.out.println(s2.equals(t2));
    }
}
