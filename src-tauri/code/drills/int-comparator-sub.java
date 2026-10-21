import java.util.*;

public class Main {
    public static void main(String[] args) {
        Comparator<Integer> bySub = (x, y) -> x - y;
        System.out.println(bySub.compare(Integer.MAX_VALUE, -1));
        Integer[] a = {3, Integer.MIN_VALUE, -5, Integer.MAX_VALUE};
        Arrays.sort(a, bySub);
        System.out.println(Arrays.toString(a));
        Arrays.sort(a, Integer::compare);
        System.out.println(Arrays.toString(a));
    }
}
