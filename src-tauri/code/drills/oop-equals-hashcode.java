import java.util.*;

public class Main {
    static class P {
        final int x, y;
        P(int x, int y) { this.x = x; this.y = y; }
        @Override public boolean equals(Object o) {
            return o instanceof P q && q.x == x && q.y == y;
        }
    }
    record R(int x, int y) {}

    public static void main(String[] args) {
        Set<P> ps = new HashSet<>();
        ps.add(new P(1, 2));
        System.out.println(new P(1, 2).equals(new P(1, 2)));
        System.out.println(ps.contains(new P(1, 2)));
        System.out.println(new ArrayList<>(ps).contains(new P(1, 2)));
        Set<R> rs = new HashSet<>();
        rs.add(new R(1, 2));
        System.out.println(rs.contains(new R(1, 2)));
    }
}
