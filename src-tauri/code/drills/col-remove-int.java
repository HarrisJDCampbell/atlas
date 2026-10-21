import java.util.*;

public class Main {
    public static void main(String[] args) {
        List<Integer> list = new ArrayList<>(List.of(10, 20, 30, 1));
        list.remove(1);
        System.out.println(list);
        list.remove(Integer.valueOf(1));
        System.out.println(list);
        try {
            list.remove(10);
        } catch (Exception e) {
            System.out.println(e.getClass().getSimpleName());
        }
    }
}
