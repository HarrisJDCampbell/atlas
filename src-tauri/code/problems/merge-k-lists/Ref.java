import java.util.*;

class Ref {
    public ListNode mergeKLists(ListNode[] lists) {
        // Integer.compare, not a.val - b.val: the subtraction overflows for values near the int limits.
        PriorityQueue<ListNode> heap = new PriorityQueue<>((a, b) -> Integer.compare(a.val, b.val));
        for (ListNode l : lists) if (l != null) heap.offer(l);
        ListNode dummy = new ListNode(), tail = dummy;
        while (!heap.isEmpty()) {
            ListNode n = heap.poll();
            tail.next = n;
            tail = n;
            if (n.next != null) heap.offer(n.next);
        }
        return dummy.next;
    }
}
