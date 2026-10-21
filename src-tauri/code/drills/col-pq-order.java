import java.util.*;

public class Main {
    public static void main(String[] args) {
        PriorityQueue<Integer> pq = new PriorityQueue<>();
        for (int x : new int[]{5, 1, 4, 2, 3}) pq.offer(x);
        System.out.println(pq);
        System.out.println(pq.peek());
        StringBuilder order = new StringBuilder();
        while (!pq.isEmpty()) order.append(pq.poll()).append(' ');
        System.out.println(order.toString().trim());
        PriorityQueue<Integer> max = new PriorityQueue<>(Collections.reverseOrder());
        max.addAll(List.of(5, 1, 4, 2, 3));
        System.out.println(max.poll() + " " + max.poll());
    }
}
