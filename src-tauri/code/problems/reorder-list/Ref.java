class Ref {
    public void reorderList(ListNode head) {
        if (head == null || head.next == null) return;
        // 1. Find the end of the first half (slow stops at the middle, or the left-middle for even length).
        ListNode slow = head, fast = head;
        while (fast.next != null && fast.next.next != null) {
            slow = slow.next;
            fast = fast.next.next;
        }
        // 2. Cut the list and reverse the second half.
        ListNode prev = null, cur = slow.next;
        slow.next = null;
        while (cur != null) {
            ListNode next = cur.next;
            cur.next = prev;
            prev = cur;
            cur = next;
        }
        // 3. Weave the reversed second half into the first.
        ListNode a = head, b = prev;
        while (b != null) {
            ListNode an = a.next, bn = b.next;
            a.next = b;
            b.next = an;
            a = an;
            b = bn;
        }
    }
}
