import java.util.*;

// Helper classes live inside the Ref class so they never collide with yours.
class RefLRUCache {
    private static final class Node {
        int key, val;
        Node prev, next;
        Node(int k, int v) { key = k; val = v; }
    }

    private final int cap;
    private final Map<Integer, Node> map = new HashMap<>();
    private final Node head = new Node(0, 0), tail = new Node(0, 0); // sentinels: head.next is most recent

    RefLRUCache(int capacity) {
        cap = capacity;
        head.next = tail;
        tail.prev = head;
    }

    public int get(int key) {
        Node n = map.get(key);
        if (n == null) return -1;
        unlink(n);
        pushFront(n);
        return n.val;
    }

    public void put(int key, int value) {
        Node n = map.get(key);
        if (n != null) {
            n.val = value;
            unlink(n);
            pushFront(n);
            return;
        }
        if (map.size() == cap) {
            Node lru = tail.prev;
            unlink(lru);
            map.remove(lru.key);
        }
        n = new Node(key, value);
        map.put(key, n);
        pushFront(n);
    }

    private void unlink(Node n) { n.prev.next = n.next; n.next.prev = n.prev; }
    private void pushFront(Node n) { n.next = head.next; n.prev = head; head.next.prev = n; head.next = n; }
}
