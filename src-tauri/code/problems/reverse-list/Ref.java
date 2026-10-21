class Ref {
    public ListNode reverseList(ListNode head) {
        ListNode prev = null, cur = head;
        while (cur != null) {
            ListNode next = cur.next; // save it before the link is overwritten
            cur.next = prev;
            prev = cur;
            cur = next;
        }
        return prev;
    }
}
