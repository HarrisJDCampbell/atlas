import java.util.*;

public class Main {
    public static void main(String[] args) {
        Map<Long, String> names = new HashMap<>();
        names.put(1L, "one");
        int id = 1;
        System.out.println(names.get(id));
        System.out.println(names.get((long) id));
        System.out.println(names.containsKey(1));
        Long big = 1L;
        System.out.println(big.equals(1));
        System.out.println(big == 1);
    }
}
