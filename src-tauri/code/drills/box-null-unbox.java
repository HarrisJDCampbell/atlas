import java.util.*;

public class Main {
    public static void main(String[] args) {
        Map<String, Integer> count = new HashMap<>();
        count.put("a", 2);
        try {
            int b = count.get("b");
            System.out.println(b);
        } catch (Exception e) {
            System.out.println(e.getClass().getSimpleName());
        }
        System.out.println(count.getOrDefault("b", 0) + 1);
        count.merge("b", 1, Integer::sum);
        count.merge("b", 1, Integer::sum);
        System.out.println(count.get("b"));
    }
}
