import java.util.*;

public class Main {
    public static void main(String[] args) {
        List<Integer> a = new ArrayList<>(List.of(1, 2, 3, 4));
        try {
            for (Integer x : a) if (x == 2) a.remove(x);
        } catch (Exception e) {
            System.out.println(e.getClass().getSimpleName());
        }
        System.out.println(a);
        List<Integer> b = new ArrayList<>(List.of(1, 2, 3, 4));
        b.removeIf(x -> x % 2 == 0);
        System.out.println(b);
        List<Integer> c = new ArrayList<>(List.of(1, 2, 3, 4));
        for (Integer x : c) if (x == 3) c.remove(x);
        System.out.println(c);
    }
}
