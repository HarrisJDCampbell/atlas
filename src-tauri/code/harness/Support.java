import java.util.*;

// The node types interview problems hand you. Public fields and constructors match
// what every interview platform uses, so code written here pastes anywhere.

class ListNode {
    int val;
    ListNode next;
    ListNode() {}
    ListNode(int val) { this.val = val; }
    ListNode(int val, ListNode next) { this.val = val; this.next = next; }

    static ListNode of(int... vals) {
        ListNode dummy = new ListNode(), cur = dummy;
        for (int v : vals) { cur.next = new ListNode(v); cur = cur.next; }
        return dummy.next;
    }

    /** Values in order; stops after 100k nodes so a cycle can't hang the judge. */
    static List<Integer> values(ListNode head) {
        List<Integer> out = new ArrayList<>();
        for (ListNode n = head; n != null && out.size() < 100_000; n = n.next) out.add(n.val);
        return out;
    }
}

class TreeNode {
    int val;
    TreeNode left, right;
    TreeNode() {}
    TreeNode(int val) { this.val = val; }
    TreeNode(int val, TreeNode left, TreeNode right) { this.val = val; this.left = left; this.right = right; }

    /** Level order with nulls, e.g. of(3, 9, 20, null, null, 15, 7). */
    static TreeNode of(Integer... vals) {
        if (vals.length == 0 || vals[0] == null) return null;
        TreeNode root = new TreeNode(vals[0]);
        Deque<TreeNode> q = new ArrayDeque<>();
        q.add(root);
        int i = 1;
        while (!q.isEmpty() && i < vals.length) {
            TreeNode n = q.poll();
            if (i < vals.length && vals[i] != null) { n.left = new TreeNode(vals[i]); q.add(n.left); }
            i++;
            if (i < vals.length && vals[i] != null) { n.right = new TreeNode(vals[i]); q.add(n.right); }
            i++;
        }
        return root;
    }

    /** Level order with nulls, trailing nulls trimmed. */
    static List<Integer> levels(TreeNode root) {
        List<Integer> out = new ArrayList<>();
        Deque<TreeNode> q = new ArrayDeque<>();
        q.add(root == null ? NIL : root);
        while (!q.isEmpty() && out.size() < 200_000) {
            TreeNode n = q.poll();
            if (n == NIL) { out.add(null); continue; }
            out.add(n.val);
            q.add(n.left == null ? NIL : n.left);
            q.add(n.right == null ? NIL : n.right);
        }
        while (!out.isEmpty() && out.get(out.size() - 1) == null) out.remove(out.size() - 1);
        return out;
    }

    private static final TreeNode NIL = new TreeNode();
}
