import java.util.*;

class Ref {
    public boolean isValidBST(TreeNode root) {
        return valid(root, Long.MIN_VALUE, Long.MAX_VALUE);
    }

    // Every node must sit strictly inside the open interval its ancestors allow.
    // long bounds, so a node holding Integer.MIN_VALUE or MAX_VALUE is still inside them.
    private boolean valid(TreeNode n, long lo, long hi) {
        if (n == null) return true;
        if (n.val <= lo || n.val >= hi) return false;
        return valid(n.left, lo, n.val) && valid(n.right, n.val, hi);
    }
}
