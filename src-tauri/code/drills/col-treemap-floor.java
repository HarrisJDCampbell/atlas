import java.util.*;

public class Main {
    public static void main(String[] args) {
        TreeMap<Integer, String> m = new TreeMap<>();
        m.put(10, "a");
        m.put(20, "b");
        m.put(30, "c");
        System.out.println(m.floorKey(25) + " " + m.ceilingKey(25));
        System.out.println(m.floorKey(20) + " " + m.lowerKey(20) + " " + m.higherKey(20));
        System.out.println(m.floorKey(5));
        System.out.println(m.headMap(20) + " " + m.tailMap(20));
        System.out.println(m.firstKey() + " " + m.lastEntry().getValue());
    }
}
